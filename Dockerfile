# TeamTask API (SQLite). Build from repo root:
#   docker compose up -d --build
FROM node:20-bookworm-slim

WORKDIR /app

# better-sqlite3 may need build tools if no prebuild matches
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev

COPY server/src ./src
COPY server/web ./web
COPY server/public ./public

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
ENV TEAMTASK_WEB_DIST=/app/web
ENV TEAMTASK_DATA_DIR=/app/data
ENV TEAMTASK_UPLOADS_DIR=/app/data/uploads

RUN mkdir -p /app/data/uploads

EXPOSE 4000
CMD ["node", "src/index.js"]
