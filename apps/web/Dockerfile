# Build context: the repository root. docker build -f apps/web/Dockerfile .
FROM node:26-slim AS base
RUN npm install -g corepack && corepack enable
WORKDIR /repo

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@$(node -p "require('./package.json').devDependencies.turbo") prune @shura/web --docker

FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN pnpm --filter @shura/web build

FROM nginxinc/nginx-unprivileged:1.30-alpine-slim
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist/ /usr/share/nginx/html/
EXPOSE 8080
