module.exports = function setupBufferChannels(app) {
  app.get("/api/buffer/channels", async (req, res) => {
    res.set("Cache-Control", "no-store");

    const connection = req.session.buffer;

    if (
      !connection ||
      connection.expiresAt <= Date.now() + 30000
    ) {
      return res.status(401).json({
        error: "Please reconnect your Buffer account."
      });
    }

    async function queryBuffer(query) {
      const response = await fetch("https://api.buffer.com", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(30000)
      });

      const result = await response.json();

      if (!response.ok || result.errors?.length || !result.data) {
        console.error(
          "Buffer channel request failed:",
          response.status
        );

        throw new Error(
          response.status === 401
            ? "Your Buffer connection expired. Please reconnect."
            : "Could not load your accounts from Buffer. Try again shortly."
        );
      }

      return result.data;
    }

    try {
      const accountData = await queryBuffer(`
        query {
          account {
            organizations {
              id
              name
            }
          }
        }
      `);

      const organizations = accountData.account?.organizations;

      if (!Array.isArray(organizations)) {
        throw new Error("Buffer did not return an organization list.");
      }

      const channels = [];

      for (const organization of organizations) {
        const channelData = await queryBuffer(`
          query {
            channels(input: {
              organizationId: ${JSON.stringify(organization.id)}
            }) {
              id
              name
              service
            }
          }
        `);

        if (!Array.isArray(channelData.channels)) {
          throw new Error("Buffer did not return a channel list.");
        }

        for (const channel of channelData.channels) {
          channels.push({
            id: channel.id,
            name: channel.name,
            service: channel.service,
            organization: organization.name
          });
        }
      }

      res.json({ channels });
    } catch (error) {
      res.status(502).json({
        error: error.name === "TimeoutError"
          ? "Buffer took too long to respond. Please try again."
          : error.message
      });
    }
  });
};