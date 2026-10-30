# Build context: the repository root. docker build -f apps/gateway/Dockerfile .
FROM node:26-slim AS base
RUN npm install -g corepack && corepack enable
WORKDIR /repo

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@$(node -p "require('./package.json').devDependencies.turbo") prune @shura/gateway --docker

FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN pnpm --filter @shura/gateway build

FROM node:26-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/gateway/dist/ ./
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "main.js"]
