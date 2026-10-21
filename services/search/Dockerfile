FROM node:20-alpine AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /workspace

RUN corepack enable

# Install the workspace dependency graph with the lockfile from the repository root.
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
RUN pnpm install --frozen-lockfile --filter "@linkora/search..."

COPY packages/types ./packages/types
COPY services/search ./services/search
RUN pnpm --filter @linkora/search build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache curl

COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/services/search/node_modules ./services/search/node_modules
COPY --from=build --chown=node:node /workspace/services/search/package.json ./services/search/package.json
COPY --from=build --chown=node:node /workspace/services/search/dist ./services/search/dist
COPY --from=build --chown=node:node /workspace/packages/types ./packages/types

USER node
WORKDIR /app/services/search
EXPOSE 3004
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=30s \
  CMD curl -f http://localhost:3004/health || exit 1

CMD ["node", "dist/index.js"]
