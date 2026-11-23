FROM node:22-alpine

WORKDIR /app

RUN mkdir -p /app/.compile-cache && chown -R node:node /app

COPY --chown=node:node showcase.config.json ./showcase.config.json
COPY --chown=node:node packages/ai-gateway ./packages/ai-gateway
COPY --chown=node:node server ./server
COPY --chown=node:node web ./web
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node bundles ./bundles

USER node

ENV NODE_ENV=production
ENV PORT=8080
ENV NODE_COMPILE_CACHE=/app/.compile-cache
ENV NODE_COMPILE_CACHE_PORTABLE=1

# Pre-warm V8 compile cache under runtime UID (node)
RUN node -e "import('./server/index.mjs').then(() => console.log('Compile cache warmed'))"

EXPOSE 8080

CMD ["node", "server/index.mjs"]
