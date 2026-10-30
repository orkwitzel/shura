# Build context: the repository root. docker build -f apps/game/Dockerfile .
FROM node:26-slim AS base
RUN npm install -g corepack && corepack enable
WORKDIR /repo

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@$(node -p "require('./package.json').devDependencies.turbo") prune @shura/game --docker

FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN pnpm --filter @shura/game build

FROM node:26-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/game/dist/ ./
USER node
EXPOSE 8081
CMD ["node", "--enable-source-maps", "main.js"]
