#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
IMAGE="home-discord-bot:local"
CONTAINER="home-discord-bot"
APPDATA="/mnt/user/appdata/home-discord-bot"
if [[ ! -f .env ]]; then
  echo "ERROR: Copy .env.example to .env and fill in Discord values and PANEL_PASSWORD."
  exit 1
fi
# Parse plain KEY=value entries; never execute/source a secrets file.
env_value() {
  local key="$1" fallback="$2" value
  value=$(sed -n "s/^${key}=//p" .env | tail -n 1 | tr -d '\r')
  printf '%s' "${value:-$fallback}"
}
PORT=$(env_value PANEL_PORT 3000)
HOST_PORT=$(env_value PANEL_HOST_PORT 3000)
BIND_IP=$(env_value PANEL_BIND_IP 0.0.0.0)
PASSWORD=$(env_value PANEL_PASSWORD '')
for p in "$PORT" "$HOST_PORT"; do
  if [[ ! "$p" =~ ^[1-9][0-9]{0,4}$ ]] || (( 10#$p > 65535 )); then
    echo "ERROR: Panel ports must be between 1 and 65535."; exit 1
  fi
done
if (( ${#PASSWORD} < 16 )) || [[ "$PASSWORD" == 'CHANGE_ME_TO_A_RANDOM_PASSWORD' ]]; then
  echo "ERROR: Set a unique PANEL_PASSWORD of at least 16 characters."; exit 1
fi
unset PASSWORD
mkdir -p "$APPDATA/data"
echo "[1/4] Building image; existing container keeps running until this succeeds..."
docker build --pull -t "$IMAGE" .
echo "[2/4] Preparing persistent data permissions for container user 1000..."
docker run --rm --user 0 --entrypoint /bin/sh -v "$APPDATA/data:/app/data" "$IMAGE" -c 'chown -R 1000:1000 /app/data'
echo "[3/4] Recreating container..."
if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
  docker stop --time 20 "$CONTAINER" >/dev/null
  docker rm "$CONTAINER" >/dev/null
fi
docker run -d --name "$CONTAINER" --restart unless-stopped \
  --env-file .env --env PANEL_HOST=0.0.0.0 \
  -p "$BIND_IP:$HOST_PORT:$PORT" \
  --log-opt max-size=10m --log-opt max-file=3 \
  -v "$APPDATA/data:/app/data" "$IMAGE"
echo "[4/4] Panel: http://YOUR-UNRAID-IP:$HOST_PORT"
echo "Container started. Check Discord login in the logs below."
sleep 2
docker logs --tail 80 "$CONTAINER"
