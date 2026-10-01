# TutorForge

An AI-assisted content platform for education tutors — built as a showcase of test
automation, CI/CD, and AI engineering practice.

Tutors manage learner profiles (age band, region/curriculum, character profile, and an
optional self-declared gender used for representation only), request AI-generated
explainers, worked examples, worksheets and quizzes, then review and edit every draft
before it reaches a learner.

A **content catalog** sits alongside the generator: taxonomy-navigable pages for courses,
tutorials, reference books, audio and video, enriched with age-band fit, readability,
prerequisites and curriculum alignment so a tutor can assign existing material or generate
new material from the same place. Third-party content is linked or embedded, never hosted.
See [docs/CATALOG.md](./docs/CATALOG.md).

**Stack:** Node 22 + NestJS · Angular 20+ · PostgreSQL + Drizzle · BullMQ/Redis · Claude API

**Status:** Phase 1 — Walking skeleton in progress. Phase 2a catalog foundation
landed: taxonomy spine, usage-rights invariants, depth gate, and public read APIs.

## Getting started

### Requirements

- Node.js 22.22.3 or newer within Node 22
- pnpm 10.6.5 (the repository pins this through `packageManager`)
- Docker Compose
- An Auth0 tenant and a registered Single Page Application/API

### Setup

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
docker compose up -d
pnpm db:migrate
```

Set `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` in `apps/api/.env`. Set the public Auth0
domain, client ID, and audience in [app-config.json](./apps/web/public/app-config.json),
then add `http://localhost:4200` as the Auth0 callback, logout, and web origin URL.
The API audience must match the Auth0 API identifier and the `AUTH0_AUDIENCE`
setting. The browser config contains public values only; never put an Auth0 client
secret there.

Start the API and Angular app together:

```sh
pnpm dev
```

Run checks and tests:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm test:integration
pnpm test:e2e
```

Seed the subject taxonomy (ISCED-F fields, UK National Curriculum subjects, and
the Key Stage 3/4 wedge topics) after migrating:

```sh
pnpm db:seed
```

The Compose stack starts PostgreSQL 16 and Redis 7 on localhost. Its default
credentials are for local development only; do not reuse them outside this machine.
Phase 1 uses PostgreSQL; Redis is ready for the Phase 3 generation queue.
Integration and browser tests need Docker running. `pnpm api:check` verifies the
committed OpenAPI document and generated Angular API types.

### Fly.io staging

Successful `main` pushes deploy the API and Angular app after the quality,
PostgreSQL integration, and Playwright jobs pass. The API image runs Drizzle
migrations as a Fly release command before the new version is activated. The web
container serves the Angular build and proxies `/api/` to the API over Fly's
private network.

To enable deployment:

1. Create separate Fly apps for the API and web app in the same organization and
   region. The defaults are `tutorforge-api-staging` and
   `tutorforge-web-staging`; the names must be globally unique.
2. Provision Fly Managed Postgres in that organization/region, then set
   `DATABASE_URL`, `AUTH0_DOMAIN`, and `AUTH0_AUDIENCE` as secrets on the API app.
   Fly Managed Postgres currently starts at $38/month plus storage; check
   [current pricing and availability](https://fly.io/docs/mpg/) before provisioning.
3. Add a GitHub Actions environment named `staging`. Set its `FLY_API_APP` and
   `FLY_WEB_APP` variables to the two app names; set `AUTH0_DOMAIN`,
   `AUTH0_CLIENT_ID`, and `AUTH0_AUDIENCE` to the public Auth0 SPA/API values.
   Configure Auth0's callback, logout, and web-origin URLs for
   `https://<web-app-name>.fly.dev`.
4. Add separate app-scoped Fly deploy tokens as the `FLY_API_DEPLOY_TOKEN` and
   `FLY_WEB_DEPLOY_TOKEN` secrets in that GitHub environment. The workflow uses
   one token per app; it does not need organization-wide Fly credentials.

Auth0 values passed to the web image are public configuration, not secrets; never
pass an Auth0 client secret as a build argument. The Fly app configuration lives
in `apps/api/fly.toml` and `apps/web/fly.toml`. The official Fly Terraform
provider is archived and does not support Managed Postgres, so deployment uses
Fly's native configuration and CLI rather than an unmaintained Terraform
provider. Managed Redis is deferred until the Phase 3 queue needs it.

## Content catalog

The catalog's rights model is enforced in three places from one definition:
`checkUsageRights` in `@tutorforge/shared`, matching PostgreSQL `CHECK`
constraints on `resources`, and an audit over every stored row. A resource is
deep-linked, embedded through the provider's own player, or — for open licences
only — mirrored; `licence` and `usage_tier` are mandatory and the database
refuses any row the application layer would reject.

Taxonomy nodes stay unpublished until they pass the depth gate (12 resources
across 3 media types), so navigation never presents a topic as covered when it
is not. `CatalogService.refreshDepthGate()` recomputes the counters and is
idempotent. Uncovered nodes also support a demand signal: the public request
button records demand and the product can prioritise light-up work from the most
requested topic clusters.

| Endpoint                              | Purpose                                                          |
| ------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/v1/catalog/taxonomy`        | Browse the tree; published nodes and their ancestors by default  |
| `GET /api/v1/catalog/nodes/:slug`     | One taxonomy node                                                |
| `POST /api/v1/catalog/nodes/:slug/request` | Register a demand signal for an uncovered topic          |
| `GET /api/v1/catalog/demand`           | Sort the most requested topics by request volume                 |
| `GET /api/v1/catalog/resources`       | Published resources with facet counts; `node` filters by subtree |
| `GET /api/v1/catalog/resources/:slug` | One published resource with its tier capabilities                |

📋 **[Read the full plan → PLAN.md](./PLAN.md)** ·
**[Content catalog plan](./docs/CATALOG.md)** ·
**[Multi-agent orchestration plan](./docs/AGENTS.md)** ·
**[Architecture decisions](./docs/adr/)**
