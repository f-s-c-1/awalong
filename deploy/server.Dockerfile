FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
RUN pnpm install --frozen-lockfile --filter @awalong/server... \
  && pnpm --filter @awalong/server build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/server/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
