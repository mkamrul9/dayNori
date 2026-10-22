# Use a Node host for the current Fastify/Next.js topology; this is not a static export.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.5 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm -r --filter '!@daynori/mobile' run build
RUN pnpm --filter @daynori/api deploy --prod /out/api \
 && pnpm --filter @daynori/worker deploy --prod /out/worker \
 && pnpm --filter @daynori/web deploy --prod /out/web

FROM node:24-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/api .
USER node
EXPOSE 3001
CMD ["node", "dist/start.js"]

FROM node:24-bookworm-slim AS web
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/web .
COPY --from=build --chown=node:node /app/apps/web/.next .next
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]

FROM node:24-bookworm-slim AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/worker .
USER node
CMD ["node", "dist/index.js"]
