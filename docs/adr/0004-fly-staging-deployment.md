# ADR 0004: Fly.io staging deployment

- Status: Accepted
- Date: 2026-10-01

## Context

Phase 1 requires a repeatable staging deployment with migrations run before
application release. Fly.io was selected for the showcase. The plan originally
called for Terraform-managed infrastructure, but Fly's official Terraform
provider is archived, explicitly unmaintained, and lists Postgres as unsupported.
Fly Managed Postgres is provisioned separately and has a non-zero ongoing cost.

## Decision

- Build independent API and Angular web images from the workspace root.
- Keep runtime and release configuration in app-specific `fly.toml` files.
- Deploy from `main` with GitHub Actions only after quality, integration, and E2E
  checks pass. Use separate, app-scoped deployment tokens.
- Run Drizzle migrations with Fly's `release_command`, before serving the new API
  release.
- Proxy browser `/api/` requests through the web app to the API's private Fly
  address, keeping browser requests same-origin.
- Store Auth0 API credentials and the database URL as Fly API-app secrets. Only
  the Auth0 SPA's public configuration is passed to the web image.
- Provision Managed Postgres outside the repository; defer managed Redis until
  Phase 3 introduces the queue.

## Consequences

The application deployment is reproducible from checked-in configuration, but
Fly apps and Managed Postgres are not provisioned by Terraform. A maintained
provider or a future hosting change can revisit that infrastructure-management
choice. Staging activation still requires Fly resources, Auth0 configuration, and
GitHub environment secrets and variables.
