FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Temporary build values only. Real secrets are supplied at container runtime.
RUN NODE_ENV=development HOST=0.0.0.0 PORT=3333 LOG_LEVEL=info \
    APP_KEY=build-only-key-never-use-in-production APP_URL=http://localhost:3333 \
    DB_PASSWORD=build-only SESSION_DRIVER=cookie node ace build

FROM node:24-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3333 LOG_LEVEL=info SESSION_DRIVER=cookie UPLOADS_PATH=/data/uploads
COPY --from=builder --chown=node:node /app/build ./
RUN npm ci --omit=dev && npm cache clean --force && mkdir -p /data/uploads && chown -R node:node /data /app
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-production.mjs"]
