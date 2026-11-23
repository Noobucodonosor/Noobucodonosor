FROM node:22-alpine

WORKDIR /app

COPY showcase.config.json ./showcase.config.json
COPY server ./server
COPY web ./web
COPY scripts ./scripts
COPY bundles ./bundles

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server/index.mjs"]
