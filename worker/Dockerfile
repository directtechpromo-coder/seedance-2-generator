# worker/Dockerfile — Vidro Long-Video Engine worker
# Build from the REPO ROOT:  docker build -f worker/Dockerfile -t vidro-worker .
FROM node:22-bookworm-slim

# ffmpeg for assembly; Noto fonts so burned-in Urdu/Hindi captions render correctly.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core fonts-noto-extra ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better layer caching). postinstall runs `prisma generate`,
# so the schema + config must be present.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

COPY src ./src
COPY worker ./worker

ENV NODE_ENV=production \
    ENGINE_WORKDIR=/tmp/vidro-engine

CMD ["node", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "worker/engine-worker.js"]
