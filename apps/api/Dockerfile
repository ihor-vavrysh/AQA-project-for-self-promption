FROM node:22-bookworm-slim AS build

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.6.5 --activate

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @tutorforge/shared build
RUN pnpm --filter @tutorforge/api build

FROM node:22-bookworm-slim AS runtime

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.6.5 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY e2e/package.json e2e/package.json
COPY tools/openapi-codegen/package.json tools/openapi-codegen/package.json
COPY --from=build /workspace/apps/api/dist apps/api/dist
COPY --from=build /workspace/apps/api/drizzle apps/api/drizzle
COPY --from=build /workspace/packages/shared/dist packages/shared/dist

RUN pnpm install --prod --frozen-lockfile --filter @tutorforge/api...

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]
