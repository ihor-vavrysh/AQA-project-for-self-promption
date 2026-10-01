# TutorForge API

NestJS REST API with Auth0 JWT verification, Drizzle/PostgreSQL persistence, and
OpenAPI generated from Nest decorators.

From the repository root:

```sh
cp apps/api/.env.example apps/api/.env
docker compose up -d
pnpm db:migrate
pnpm --filter @tutorforge/api dev
```

Replace the Auth0 domain and audience placeholders in `apps/api/.env`. The public
health endpoint is `GET /api/v1/health`; the authenticated tutor profile endpoint is
`GET /api/v1/me`. Swagger UI is served at `/api/docs`.

`pnpm api:generate` exports `openapi.json` from Nest and regenerates the Angular
types. Use `pnpm --filter @tutorforge/api db:generate` after changing the Drizzle
schema, then review and commit the generated SQL migration.
