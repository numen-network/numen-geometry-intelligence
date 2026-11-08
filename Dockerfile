FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY fixtures ./fixtures
COPY tests ./tests
RUN node --experimental-strip-types --test tests/*.test.ts
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8000 NUMEN_CATALOG_DB=/app/data/numen-catalog.sqlite NUMEN_GEOMETRY_CACHE=/app/cache
RUN mkdir -p /app/data /app/cache && chown -R node:node /app
USER node
EXPOSE 8000
CMD ["node", "--experimental-strip-types", "src/server.ts"]
