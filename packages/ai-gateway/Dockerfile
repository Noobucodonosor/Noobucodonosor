FROM node:22-alpine

WORKDIR /app

# Create non-root compile cache directory owned by the built-in `node` user (UID 1000)
RUN mkdir -p /app/.compile-cache && chown -R node:node /app

COPY --chown=node:node package.json ./package.json
COPY --chown=node:node src ./src

USER node

ENV NODE_ENV=production
ENV PORT=8080
ENV NODE_COMPILE_CACHE=/app/.compile-cache
ENV NODE_COMPILE_CACHE_PORTABLE=1

# Pre-warm V8 bytecode compile cache under the exact runtime UID
RUN node -e "import('./src/server.mjs').then(() => console.log('Compile cache warmed'))"

EXPOSE 8080

CMD ["node", "src/server.mjs"]
