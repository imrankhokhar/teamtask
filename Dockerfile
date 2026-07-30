# Build from repository root after `prepare-cloud.cmd` (or build-windows) has created app/dist
FROM node:20-alpine

WORKDIR /app

COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev

COPY server/src ./src
COPY server/web ./web
COPY server/public ./public

ENV NODE_ENV=production
ENV PORT=4000
ENV TEAMTASK_WEB_DIST=/app/web
ENV TEAMTASK_DATA_DIR=/app/data
ENV TEAMTASK_UPLOADS_DIR=/app/data/uploads

EXPOSE 4000
CMD ["node", "src/index.js"]
