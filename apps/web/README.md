# TutorForge web

Standalone Angular application. The Auth0 client ID, domain, and API audience are
public browser settings in `public/app-config.json`; never put a client secret in
that file.

Start the API and database first, then run `pnpm --filter @tutorforge/web dev` from
the repository root. The development server proxies `/api` requests to Nest.

Run `pnpm --filter @tutorforge/web test` for component tests and `pnpm
--filter @tutorforge/web build` for the production bundle.
