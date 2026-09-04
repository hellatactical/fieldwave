# Install Fieldwave on Unraid

This route uses the prebuilt GitHub Container Registry image. **The repository owner must complete [publishing](PUBLISHING.md) first.** The configured image destination is `ghcr.io/hellatactical/fieldwave:latest`.

## Prepare your Discord bot

Create and invite your own bot using [the Discord setup steps](SETUP.md#1-create-and-invite-your-bot). Have its token, Application ID and Server ID ready. Choose a separate random panel password of at least 16 characters.

## Add the container

1. In the Unraid terminal, prepare the persistent folder for the image's non-root user:

   ```bash
   mkdir -p /mnt/user/appdata/fieldwave
   chown 1000:1000 /mnt/user/appdata/fieldwave
   ```

2. Go to **Docker → Add Container** and enter:

   | Field | Value |
   | --- | --- |
   | Name | `fieldwave` |
   | Repository | `ghcr.io/hellatactical/fieldwave:latest` |
   | Network type | Bridge |
   | WebUI (Advanced View) | `http://[IP]:[PORT:3000]` |
   | Privileged | Off |

3. Add a **Port**: container `3000`, host `3000`, connection type `TCP`. If 3000 is occupied, change only the host port to 3080 (or another free port).
4. Add a **Path**: container `/app/data`, host `/mnt/user/appdata/fieldwave`, read/write.
5. Add these **Variables**:

   | Key | Value |
   | --- | --- |
   | `DISCORD_TOKEN` | Your secret bot token |
   | `DISCORD_CLIENT_ID` | Your Application ID |
   | `DISCORD_GUILD_ID` | Your server ID; leave blank for global commands |
   | `PANEL_PASSWORD` | Your unique panel password, 16+ characters |
   | `PANEL_PORT` | `3000` |
   | `PANEL_SECURE_COOKIE` | `false` for local HTTP |
   | `BOT_STATUS` | `/play · fieldwave` |

6. Click **Apply/Create**, wait for the image download, then turn **Auto-Start** on.
7. Open the container's **WebUI**, or visit `http://YOUR-UNRAID-IP:3000`. Sign in with the panel password.
8. Join a Discord voice channel and use `/play` to begin. The panel controls playback from there.

Node, FFmpeg, yt-dlp and the Node dependencies are already inside the image. You do not install them on Unraid or clone the source to use this route.

### Optional saved template

The repository includes [unraid/fieldwave.xml](../unraid/fieldwave.xml), with password fields, port, appdata path, icon and WebUI defaults. Once its repository details are configured, copy it to `/boot/config/plugins/dockerMan/templates-user/my-fieldwave.xml`. It can then be selected in **Docker → Add Container → Template**. Still prepare the appdata folder above and fill in your secrets. This is a personal template, not a Community Applications listing.

## Updates and migration

For `:latest`, use **Check for Updates → Update** on Unraid's Docker page after GitHub's build completes. Settings survive in appdata; playback, logs and browser sessions restart. A fixed version tag stays fixed until you change it.

If you already run the earlier `home-discord-bot` container, stop it and turn off its Auto-Start before starting Fieldwave with the same bot token. Map the new container's `/app/data` to your **existing** `/mnt/user/appdata/home-discord-bot/data` to keep settings. Do not run both containers against the same data folder or bot token. Keep the stopped old container until the new one is verified.

Keep the panel on your trusted LAN; do not forward the HTTP port through your router. For HTTPS via a reverse proxy, preserve the Host header and set `PANEL_SECURE_COOKIE=true`. [Full settings and troubleshooting](SETUP.md#7-login-and-troubleshooting).

Reference: [Unraid container configuration and management](https://docs.unraid.net/unraid-os/using-unraid-to/run-docker-containers/managing-and-customizing-containers/).
