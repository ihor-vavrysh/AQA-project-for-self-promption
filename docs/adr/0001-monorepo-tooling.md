# ADR 0001: TypeScript monorepo tooling

- Status: Accepted
- Date: 2026-10-01

## Context

The product has an API, a web client, and shared contracts and AI artifacts. They
need consistent TypeScript settings and quality checks while remaining independently
buildable.

## Decision

Use pnpm workspaces with Turborepo. Pin pnpm in the root manifest, require Node.js 22,
and centralize strict TypeScript, lint, formatting, and task orchestration at the
repository root.

## Consequences

- Shared contracts can be consumed by both applications without duplicating types.
- CI and local development use the same workspace scripts.
- Tasks can be cached and parallelized as the repository grows.
- Contributors need the pinned pnpm version and Node.js 22 installed.
