FROM node:24-bookworm-slim
LABEL org.opencontainers.image.title="Fieldwave" \
      org.opencontainers.image.description="Self-hosted Discord music and a private web control panel. Made with AI assistance."

ENV NODE_ENV=production \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    YTDLP_PATH=/usr/local/bin/yt-dlp \
    DATA_DIR=/app/data \
    PANEL_PORT=3000

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates tini \
    && pip3 install --break-system-packages --no-cache-dir "yt-dlp[default]==2026.8.19" \
    && printf "%s\n" "--js-runtimes node" > /etc/yt-dlp.conf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src
RUN mkdir -p /app/data && chown -R node:node /app

USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PANEL_PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]
