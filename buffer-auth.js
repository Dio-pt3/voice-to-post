const session = require("express-session");
const crypto = require("node:crypto");

module.exports = function setupBufferAuth(app) {
    if (
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 64
  ) {
    throw new Error("SESSION_SECRET must be set to a secure 64-character secret.");
  }
  app.use(session({
    name: "voicepost.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 1000
    }
  }));

  app.get("/auth/buffer", (req, res) => {
    const clientId = process.env.BUFFER_CLIENT_ID;
    const clientSecret = process.env.BUFFER_CLIENT_SECRET;
    const redirectUri = process.env.BUFFER_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(500).send(
        "Missing Buffer settings. Check .env and restart the server."
      );
    }

    const state = crypto.randomBytes(32).toString("base64url");
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");

    req.session.bufferOAuth = {
      state,
      verifier,
      createdAt: Date.now()
    };

    const url = new URL("https://auth.buffer.com/auth");

    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "account:read posts:write",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "consent"
    }).toString();

    req.session.save((error) => {
      if (error) {
        return res.status(500).send("Could not start the connection.");
      }

      res.redirect(url.toString());
    });
  });

  app.get("/auth/buffer/callback", async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");

    const pending = req.session.bufferOAuth;
    delete req.session.bufferOAuth;

    if (
      !pending ||
      typeof req.query.state !== "string" ||
      req.query.state !== pending.state ||
      Date.now() - pending.createdAt > 10 * 60 * 1000
    ) {
      return res.status(400).send(
        "Connection expired or invalid. Return to the app and connect again."
      );
    }

    if (req.query.error) {
      return res.status(400).send(
        "Buffer did not approve the connection. Return to the app to retry."
      );
    }

    if (typeof req.query.code !== "string") {
      return res.status(400).send("Buffer did not return a login code.");
    }

    try {
      const response = await fetch("https://auth.buffer.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: process.env.BUFFER_CLIENT_ID,
          client_secret: process.env.BUFFER_CLIENT_SECRET,
          grant_type: "authorization_code",
          code: req.query.code,
          redirect_uri: process.env.BUFFER_REDIRECT_URI,
          code_verifier: pending.verifier
        }),
        signal: AbortSignal.timeout(30000)
      });

      const tokens = await response.json();

      if (!response.ok || !tokens.access_token) {
        console.error("Buffer token exchange failed:", response.status);
        return res.status(502).send(
          "Buffer login could not finish. Check your client settings and retry."
        );
      }

      // Verify the token with a real, read-only Buffer API request.
      const accountResponse = await fetch("https://api.buffer.com", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: "{ account { id email } }"
        }),
        signal: AbortSignal.timeout(30000)
      });

      const accountResult = await accountResponse.json();

      if (
        !accountResponse.ok ||
        accountResult.errors?.length ||
        !accountResult.data?.account
      ) {
        return res.status(502).send(
          "Login completed, but account verification failed. Please reconnect."
        );
      }

      const expiresIn = Number(tokens.expires_in);

      if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
        return res.status(502).send(
          "Buffer returned an invalid token expiry. Please reconnect."
        );
      }

      // Start a fresh session after successful login.
      req.session.regenerate((error) => {
        if (error) {
          return res.status(500).send("Could not save the connection.");
        }

        req.session.buffer = {
          accessToken: tokens.access_token,
          expiresAt: Date.now() + expiresIn * 1000,
          email: accountResult.data.account.email
        };

        req.session.save((saveError) => {
          if (saveError) {
            return res.status(500).send("Could not save the connection.");
          }

          res.redirect("/");
        });
      });
    } catch (error) {
      res.status(502).send(
        "Could not reach Buffer. Return to the app and try connecting again."
      );
    }
  });

  app.get("/api/buffer/status", (req, res) => {
    res.set("Cache-Control", "no-store");

    const connection = req.session.buffer;
    const connected = Boolean(
      connection &&
      connection.expiresAt > Date.now() + 30000
    );

    res.json({
      connected,
      email: connected ? connection.email : null
    });
  });
};