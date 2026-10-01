# ADR 0003: Auth0 for tutor authentication

- Status: Accepted
- Date: 2026-10-01

## Context

The walking skeleton needs standards-based tutor authentication without adding
learner accounts or managing passwords. The plan considered hosted Auth0 and
self-hosted Keycloak; the user selected Auth0 for Phase 1.

## Decision

Use an Auth0 single-page application client with Authorization Code Flow + PKCE.
The Nest API accepts only RS256 bearer tokens and validates their signature against
the tenant JWKS, issuer, audience, and expiration. API claims are parsed with the
shared Zod contract before use. The `sub` claim is the stable external identity key;
only the tutor email and internal user id are returned by the profile endpoint.

The browser client ID, domain, and audience live in `apps/web/public/app-config.json`.
The API domain and audience are server environment variables. Client secrets are
never used by the browser or committed to the repository.

## Consequences

- Auth0 tenant setup and matching callback/logout URLs are required to enable sign-in.
- The API fails at startup when its database or Auth0 verifier configuration is absent
  or malformed; there is no development-only authentication bypass.
- The health endpoint is explicitly public. Tutor-profile routes require a verified
  access token.
- Auth0 account availability and pricing are external operational dependencies.
- Keycloak remains a possible future provider change behind the authentication boundary.
