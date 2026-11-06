# Build context: the repository root. docker build -f apps/gateway/Dockerfile .
FROM node:26-slim AS base
RUN npm install -g corepack && corepack enable
WORKDIR /repo

FROM base AS prune
# turbo installs before the source is copied, so a source change doesn't download it again.
COPY package.json ./
RUN npm install -g turbo@$(node -p "require('./package.json').devDependencies.turbo")
COPY . .
RUN turbo prune @shura/gateway --docker

FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
# The packages the gateway uses build first (tsdown), then the gateway itself (nest build).
RUN pnpm turbo run build --filter=@shura/gateway...
# dist/ plus the production node_modules, the workspace packages as their built dist/ (ADR 0015).
RUN pnpm --filter @shura/gateway deploy --prod /deploy

FROM node:26-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy/package.json ./
COPY --from=build /deploy/node_modules/ ./node_modules/
COPY --from=build /deploy/dist/ ./dist/
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/main.js"]
