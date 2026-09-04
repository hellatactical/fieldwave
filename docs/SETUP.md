# Home Discord Bot — Unraid V1.1

A self-hosted Discord music and utility bot with a private web control panel. It runs as **one Node 24 process in one Docker container**, using Discord Player, yt-dlp and FFmpeg. No separate web service, database, or frontend build is needed.

## What is included

- Original 24 slash commands and Discord music-player buttons.
- Password login, 12-hour sessions, logout, CSRF protection and login throttling.
- Bot online/offline status, process uptime and connected Discord server count.
- Server selector with current voice channel, playback state, track artwork, progress and full upcoming queue.
- Previous, pause/resume, skip, stop/disconnect, shuffle, track/queue loop, related-song autoplay and volume.
- Saved bot presence text and per-server starting volume/autoplay preferences.
- Latest 100 log entries, refreshed along with playback every three seconds.
- Responsive dark interface for desktop and phones.

Start songs with `/play` in Discord while in a voice channel. The web panel controls existing sessions; it does not search for songs or join channels on its own. Web admins control all servers without having to join voice. Existing Discord command/button permission behavior is preserved.

## 1. Create and invite your bot

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
2. Choose your own application/bot name and upload its avatar.
3. In **Bot**, obtain your bot token. Keep it private.
4. Copy the Application ID from General Information.
5. Enable Developer Mode in Discord; right-click your server and copy its Server ID.
6. Use the app's Installation/OAuth2 settings to create an invite with scopes `bot` and `applications.commands`.
7. Give it View Channels, Send Messages, Embed Links, **Read Message History**, Connect and Speak permissions, then invite it to your server. Read Message History allows the existing player message to be fetched and refreshed. Administrator and privileged Message Content intent are not required.

## 2. Put the project on Unraid

The ZIP contains a single `home-discord-bot` folder. Place the **contents of that folder** in:

```text
/mnt/user/appdata/home-discord-bot/source
```

`Dockerfile`, `.env.example` and `unraid-start.sh` must be directly inside `source`, not in another nested folder. Show hidden files when copying.

Open the Unraid terminal:

```bash
cd /mnt/user/appdata/home-discord-bot/source
cp .env.example .env
chmod 600 .env
nano .env
```

Set these values (replace the examples):

```env
DISCORD_TOKEN=your_secret_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_GUILD_ID=your_server_id
PANEL_PASSWORD=your_unique_random_password_at_least_16_characters
PANEL_PORT=3000
PANEL_HOST_PORT=3000
PANEL_BIND_IP=0.0.0.0
PANEL_SECURE_COOKIE=false
```

Use plain `KEY=value` lines, without quotes or inline comments. A random alphanumeric password avoids differences between Docker env-file and Compose parsing. Never send your `.env` or token to anyone. For multiple Discord servers, leave `DISCORD_GUILD_ID` blank to register global commands; otherwise commands are registered only in that server.

## 3. Build and launch

```bash
cd /mnt/user/appdata/home-discord-bot/source
bash unraid-start.sh
```

The script builds the image before stopping any existing container, prepares persistent data permissions for the container's non-root user (UID 1000), recreates `home-discord-bot`, publishes the panel port, and shows startup logs. It does not remove settings. Recreating the container ends playback and signs out web sessions.

Open **http://YOUR-UNRAID-IP:3000** and sign in with `PANEL_PASSWORD`.

### Unraid network mapping

| Setting | Default |
| --- | --- |
| Network mode | Bridge |
| Container HTTP port (`PANEL_PORT`) | 3000 TCP |
| Unraid host HTTP port (`PANEL_HOST_PORT`) | 3000 TCP |
| Bind interface (`PANEL_BIND_IP`) | 0.0.0.0, all host interfaces |
| Persistent host directory | `/mnt/user/appdata/home-discord-bot/data` |
| Container data directory | `/app/data` |
| WebUI address | `http://[IP]:[PORT:3000]` with default internal port |

If host port 3000 is occupied, set `PANEL_HOST_PORT=3080`, leave `PANEL_PORT=3000`, and run the start script again. Visit `http://YOUR-UNRAID-IP:3080`. This maps **host 3080 → container 3000**. Both ports can be changed independently; the scripts and Compose use both values. `EXPOSE 3000` is image metadata, not a restriction on `PANEL_PORT`.

Set `PANEL_BIND_IP` to your Unraid LAN address to bind only that interface. Do not forward this HTTP port through your router. Use the panel on your trusted home network; for remote use, use a private VPN or an HTTPS reverse proxy. HTTP itself does not encrypt passwords or session cookies.

The script-created container appears on Unraid's Docker page. It does not install a Community Apps template; use the URL above if no WebUI shortcut is available.

### Docker Compose alternative

Use **either** the scripts **or** Compose to manage this container. Before the first Compose launch, prepare the bind mount:

```bash
cd /mnt/user/appdata/home-discord-bot/source
mkdir -p /mnt/user/appdata/home-discord-bot/data
docker compose build --pull
docker compose run --rm --no-deps --user 0 --entrypoint /bin/sh discord-bot -c 'chown -R 1000:1000 /app/data'
docker compose up -d
docker compose logs --tail=80
```

If switching from the script-managed container, stop and remove that container first (`docker stop home-discord-bot` then `docker rm home-discord-bot`); the bind-mounted data remains intact. The same `.env`, ports and persistent directory are used.

## 4. First playback and panel test

1. Check logs for `Web panel listening` and `Logged in as`.
2. Sign into the panel and confirm the bot is online; select your Discord server.
3. Join a voice channel in Discord. Type `/play`, enter a song, select an autocomplete suggestion and submit.
4. Confirm audio plays and the Discord player card appears.
5. Check artwork, progress and voice-channel name in the web panel.
6. Pause and resume from the web panel. Confirm Discord playback and its player card update too.
7. Queue at least two additional tracks and try shuffle, skip and previous.
8. Change volume and autoplay. Test loop separately.
9. Stop playback. The bot disconnects and clears the active queue.
10. Save server defaults, restart the container, and confirm they remain saved.

Autoplay and loop share Discord Player's repeat mode, so enabling one replaces the other. Turning on autoplay selects related songs after the manual queue runs out. Loop is session-only; volume and autoplay control changes also update saved defaults. **Save defaults** affects the next session without interrupting the current one. Saved presence overrides `BOT_STATUS` after you first edit it in the panel.

Queue, history, active polls, panel sessions and recent logs are in memory and reset on restart, as in V1. The bot's name/avatar remain managed in Discord's Developer Portal. Track artwork/progress appear only when the source supplies them; unavailable artwork gets a placeholder.

## 5. Updating an existing V1 installation

1. Back up `.env` and `/mnt/user/appdata/home-discord-bot/data/settings.json` if it exists.
2. Copy the new release contents into `source`, replacing project files. **Keep your existing `.env` and data directory.** The release does not include a populated `.env`.
3. Add these new lines to your existing `.env` and choose your own password:

```env
PANEL_PASSWORD=your_unique_random_password_at_least_16_characters
PANEL_PORT=3000
PANEL_HOST_PORT=3000
PANEL_BIND_IP=0.0.0.0
PANEL_SECURE_COOKIE=false
```

4. Rebuild and recreate:

```bash
cd /mnt/user/appdata/home-discord-bot/source
bash unraid-update.sh
```

Existing guild volume/autoplay preferences remain compatible. `unraid-update.sh` rebuilds **the local source you have copied**; it does not download releases or change dependency versions automatically. An environment/port/password change also requires recreation using this script; a plain `docker restart` does not reread `.env`.

For Compose updates:

```bash
docker compose build --pull
docker compose up -d
```

To update music extraction, change the pinned yt-dlp release in `Dockerfile` and rebuild. For a Node dependency change, update `package.json`, run `npm install` with Node 24 to refresh `package-lock.json`, then rebuild. The image now uses `npm ci` for locked Node dependencies. Music-source changes can still require extractor updates.

## 6. Settings and operation

| Variable | Purpose |
| --- | --- |
| `PANEL_PASSWORD` | Required admin password; 16+ characters; no default login |
| `PANEL_PORT` | HTTP listener inside container, default 3000 |
| `PANEL_HOST_PORT` | Published Unraid port, default 3000 |
| `PANEL_BIND_IP` | Host interface published by scripts/Compose |
| `PANEL_SECURE_COOKIE` | Set `true` only when browsing through HTTPS |
| `BOT_STATUS` | Initial Discord Listening text, default `/play` |
| `DEFAULT_VOLUME` | Initial server volume, default 75 |
| `PANEL_UPDATE_SECONDS` | Existing **Discord message** refresh interval, default 15; not web polling |
| `REGISTER_COMMANDS` | Register slash commands on startup, default true |
| `DISCORD_GUILD_ID` | Optional server ID for quick guild command registration |
| `DATA_DIR` | Container settings directory, `/app/data` |

Useful commands:

```bash
docker logs -f --tail=100 home-discord-bot
docker restart home-discord-bot
docker stop home-discord-bot
docker inspect --format='{{.State.Health.Status}}' home-discord-bot
```

`/healthz` reports only whether the web process answers HTTP; Docker health does **not** prove Discord login, voice or extraction works. The authenticated panel reports Discord readiness separately. A stopped/crashed container cannot serve its own panel; an open browser will report the panel unreachable. Gateway disconnections while the process is alive appear as Offline.

Settings are saved in `/app/data/settings.json`. Logs are capped at 200 entries in process memory, with the latest 100 exposed to authenticated users. Docker log rotation is configured separately. Exact token/password values and URL query strings are redacted from captured console messages; still review logs before sharing them.

## 7. Login and troubleshooting

- **Cannot connect:** inspect container logs, confirm it is running and check host/container port mapping and LAN address. Do not set `PANEL_HOST` to loopback inside the container.
- **Startup refuses password:** set a unique password of at least 16 characters; the template placeholder is rejected.
- **Login works but returns to login:** if using plain HTTP, keep `PANEL_SECURE_COOKIE=false`. HTTPS-only cookies are not sent on normal LAN HTTP.
- **Reverse proxy:** preserve the external `Host` header. The panel checks request Origin against Host and does not enable CORS. Set `PANEL_SECURE_COOKIE=true` when using HTTPS. Rate limits use the direct peer IP; users behind one proxy share a login-attempt budget.
- **Locked out:** 10 attempts per source IP in 15 minutes trigger temporary throttling. Wait 15 minutes. Rotate a forgotten password in `.env` and recreate the container; all old sessions become invalid.
- **Settings permission error:** run the start script to prepare the data ownership, or use the Compose ownership command above. The image runs as UID 1000.
- **Bot offline/startup failed:** check Discord credentials, registration permissions and outbound network access. Fatal startup failures exit so Docker's restart policy can retry.
- **No servers/commands:** invite the bot and check the registration scope/server ID. Global commands may take time to appear.
- **Previous/shuffle disabled:** history or sufficient upcoming tracks are required.
- **Playback source error:** inspect logs and update yt-dlp/extractors as needed. No real Discord/YouTube streaming test was performed for this release.

Only use sources/content you are authorized to access. Keep the panel private: its single admin login grants playback and settings control over every server this bot joins. Sessions expire after 12 hours and are invalidated on logout or process restart.

## Validation and source layout

On Node 24:

```bash
npm ci
npm run check
npm test
```

`npm run check` checks every JavaScript file. Tests cover HTTP authentication, CSRF rejection, logout, login throttling, request size limits, assets, every playback control, per-server isolation, offline/empty queue handling and settings persistence using simulated playback. No real Discord credentials are used.

Validation performed for this release: Node 24 dependency installation, all JavaScript syntax checks and automated tests passed; both Unraid scripts passed Bash syntax checks; both Compose configurations validated using the example environment; Discord Player/extractor imports, construction and registration succeeded; browser login, playback-state changes, server selection and responsive layout were checked with preview data. The [GitHub Linux AMD64 container build](https://github.com/hellatactical/fieldwave/actions/runs/33848362861) passed and published the image, and an anonymous registry manifest request returned HTTP 200. Actual Discord voice playback and a live Unraid deployment remain unverified because no real Discord credentials or Unraid access were supplied.

```text
home-discord-bot/
  Dockerfile, docker-compose.yml, .env.example
  package.json, package-lock.json
  unraid-start.sh, unraid-update.sh
  src/index.js             Bot startup and original command handlers
  src/commands.js          Original command definitions
  src/ui.js                Original Discord player/poll cards
  src/store.js             Persistent guild and bot settings
  src/panel.js             Playback/settings adapter
  src/web.js               HTTP login/session/API server
  src/recent-logs.js        Bounded, redacted console capture
  src/web/                 HTML, CSS and browser JavaScript
  scripts/check.js         Syntax checks
  test/                    Credential-free checks
```

API integration references: [Discord Player playback node](https://discord-player.js.org/api/discord-player/classes/GuildQueuePlayerNode), [playback history](https://discord-player.js.org/api/discord-player/classes/GuildQueueHistory). The implementation also follows the installed pinned package's APIs.
