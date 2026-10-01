FROM node:22-bookworm-slim AS build

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.6.5 --activate

COPY . .

RUN pnpm install --frozen-lockfile

ARG AUTH0_DOMAIN
ARG AUTH0_CLIENT_ID
ARG AUTH0_AUDIENCE

RUN node --input-type=module -e 'import { writeFile } from "node:fs/promises"; const auth0 = { domain: process.env.AUTH0_DOMAIN, clientId: process.env.AUTH0_CLIENT_ID, audience: process.env.AUTH0_AUDIENCE }; if (!auth0.domain || !auth0.clientId || !auth0.audience) throw new Error("All public Auth0 build arguments are required"); new URL(auth0.audience); await writeFile("apps/web/public/app-config.json", `${JSON.stringify({ auth0 })}\n`);'

RUN pnpm --filter @tutorforge/shared build
RUN pnpm --filter @tutorforge/web build

FROM nginx:stable-alpine AS runtime

RUN apk add --no-cache gettext

ARG API_HOST=tutorforge-api-staging.internal:3000

COPY --from=build /workspace/apps/web/dist/web/browser /usr/share/nginx/html
COPY apps/web/deploy/default.conf.template /tmp/default.conf.template

RUN test -n "$API_HOST" \
  && envsubst '${API_HOST}' < /tmp/default.conf.template > /etc/nginx/conf.d/default.conf \
  && rm /tmp/default.conf.template

EXPOSE 8080
