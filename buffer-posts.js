module.exports = function setupBufferPosts(app) {
  const activeRequests = new Set();

  app.post("/api/buffer/post-now", async (req, res) => {
    res.set("Cache-Control", "no-store");

    const expectedOrigin = new URL(
      process.env.BUFFER_REDIRECT_URI
    ).origin;

    if (req.get("origin") !== expectedOrigin) {
      return res.status(403).json({
        error: "Please post from your app's own page."
      });
    }

    const connection = req.session.buffer;

    if (
      !connection ||
      connection.expiresAt <= Date.now() + 30000
    ) {
      return res.status(401).json({
        error: "Please reconnect your Buffer account."
      });
    }

    const { text, channelId } = req.body || {};

    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 6000 ||
      typeof channelId !== "string" ||
      !channelId.trim() ||
      channelId.length > 200
    ) {
      return res.status(400).json({
        error: "Choose an account and enter a post of 1–6,000 characters."
      });
    }

    
    // Verify that the requested channel belongs to this Buffer account.
    let channelVerified = false;

    try {
      const accountResponse = await fetch("https://api.buffer.com", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: `query {
            account {
              organizations {
                id
              }
            }
          }`
        }),
        signal: AbortSignal.timeout(15000)
      });

      const accountResult = await accountResponse.json();
      const organizations = accountResult.data?.account?.organizations;

      if (
        !accountResponse.ok ||
        accountResult.errors?.length ||
        !Array.isArray(organizations)
      ) {
        throw new Error("Could not verify Buffer organizations.");
      }

      for (const organization of organizations) {
        const channelsResponse = await fetch("https://api.buffer.com", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${connection.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            query: `query {
              channels(input: {
                organizationId: ${JSON.stringify(organization.id)}
              }) {
                id
              }
            }`
          }),
          signal: AbortSignal.timeout(15000)
        });

        const channelsResult = await channelsResponse.json();
        const channels = channelsResult.data?.channels;

        if (
          !channelsResponse.ok ||
          channelsResult.errors?.length ||
          !Array.isArray(channels)
        ) {
          throw new Error("Could not verify Buffer channels.");
        }

        if (channels.some(channel => channel.id === channelId)) {
          channelVerified = true;
          break;
        }
      }
    } catch (error) {
      console.error("Buffer channel verification failed:", error.message);

      return res.status(502).json({
        error: "Could not verify your selected Buffer account. Reload accounts and try again."
      });
    }

    if (!channelVerified) {
      return res.status(403).json({
        error: "That channel is not available on your connected Buffer account. Reload accounts and choose a valid channel."
      });
    }


    if (activeRequests.has(req.sessionID)) {
      return res.status(409).json({
        error: "A posting request is already in progress."
      });
    }

    activeRequests.add(req.sessionID);

    try {
      const response = await fetch("https://api.buffer.com", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: `
            mutation {
              createPost(input: {
                text: ${JSON.stringify(text.trim())},
                channelId: ${JSON.stringify(channelId)},
                schedulingType: automatic,
                mode: shareNow
              }) {
                ... on PostActionSuccess {
                  post {
                    id
                  }
                }
                ... on MutationError {
                  message
                }
              }
            }
          `
        }),
        signal: AbortSignal.timeout(30000)
      });

      const result = await response.json();

      if (!response.ok) {
        return res.status(502).json({
          error: response.status === 401
            ? "Your connection expired. Reconnect Buffer."
            : `Buffer returned error ${response.status}. Check Buffer before retrying.`
        });
      }

      if (result.errors?.length) {
        return res.status(502).json({
          error: result.errors.map((item) => item.message).join(" ")
        });
      }

      const action = result.data?.createPost;

      if (!action?.post?.id) {
        return res.status(400).json({
          error: action?.message ||
            "Posting was not confirmed. Check Buffer before retrying."
        });
      }

      res.json({ postId: action.post.id });
    } catch (error) {
      res.status(502).json({
        error:
          "The request was interrupted. Check Buffer before retrying to avoid a duplicate."
      });
    } finally {
      activeRequests.delete(req.sessionID);
    }
  });
};