# ADR 0002: PostgreSQL and Redis for local development

- Status: Accepted
- Date: 2026-10-01

## Context

The plan calls for PostgreSQL as the durable relational store and Redis as the
BullMQ-backed generation queue. Developers need a reproducible local environment
before API feature work begins.

## Decision

Provide PostgreSQL 16 and Redis 7 through Docker Compose, with persistent named
volumes, health checks, and ports bound only to localhost. Defaults are explicitly
for local development; environment variables may override the passwords.

## Consequences

- Local setup does not require installing either service directly on the host.
- Integration tests can evolve toward the same service versions using Testcontainers.
- Local data persists between runs and can be removed with `docker compose down -v`.
- The development credentials must never be used in shared or production environments.
