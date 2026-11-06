# Build context: the repository root. docker build -f apps/web/Dockerfile .
FROM node:26-slim AS base
RUN npm install -g corepack && corepack enable
WORKDIR /repo

FROM base AS prune
# turbo installs before the source is copied, so a source change doesn't download it again.
COPY package.json ./
RUN npm install -g turbo@$(node -p "require('./package.json').devDependencies.turbo")
COPY . .
RUN turbo prune @shura/web --docker

FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN pnpm turbo run build --filter=@shura/web

FROM nginxinc/nginx-unprivileged:1.31-alpine-slim
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist/ /usr/share/nginx/html/
EXPOSE 8080
