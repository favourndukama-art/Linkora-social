FROM node:20-alpine AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mobile/package.json apps/mobile/
COPY apps/web/package.json apps/web/
COPY packages/analytics/package.json packages/analytics/
COPY packages/codegen/package.json packages/codegen/
COPY packages/contracts/package.json packages/contracts/
COPY packages/reputation/package.json packages/reputation/
COPY packages/sdk/package.json packages/sdk/
COPY packages/types/package.json packages/types/
COPY services/analytics-oracle/package.json services/analytics-oracle/
COPY services/dm-relay/package.json services/dm-relay/
COPY services/indexer/package.json services/indexer/
COPY services/media/package.json services/media/
COPY services/notification/package.json services/notification/
COPY services/search/package.json services/search/
RUN pnpm install --frozen-lockfile --filter "@linkora/notification..."

COPY packages/types ./packages/types
COPY services/notification ./services/notification
RUN pnpm --filter @linkora/notification build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache curl

COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/services/notification/node_modules ./services/notification/node_modules
COPY --from=build --chown=node:node /workspace/services/notification/package.json ./services/notification/package.json
COPY --from=build --chown=node:node /workspace/services/notification/dist ./services/notification/dist
COPY --from=build --chown=node:node /workspace/packages/types ./packages/types

USER node
WORKDIR /app/services/notification
EXPOSE 3002
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=30s \
  CMD curl -f http://localhost:3002/health/ready || exit 1

CMD ["node", "dist/index.js"]
