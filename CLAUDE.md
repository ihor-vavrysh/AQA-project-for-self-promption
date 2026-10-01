# TutorForge engineering guide

## Project intent

TutorForge is a tutor-facing content platform and an engineering showcase. Follow
the staged scope and architectural contract in `PLAN.md`; do not start learner-facing
accounts or bypass tutor review of generated content.

## Conventions

- Use TypeScript with strict compiler options and standalone Angular components.
- Keep API boundaries validated with shared Zod schemas; do not trust client input.
- Treat prompts as versioned source artifacts and validate model output against a
  schema. Never publish unreviewed model output to a learner.
- Keep learner data minimal and pseudonymous in model requests. Optional gender
  influences representation only, never ability, difficulty, or topic selection.
- Prefer real database integration tests using Testcontainers over database mocks.
- Keep pull-request AI tests deterministic with replayed responses; reserve live
  model evaluations for scheduled or explicitly requested runs.

## Quality gates

Run the applicable checks before proposing a change:

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

Use `pnpm format` to apply formatting. Keep tests next to the behavior they verify,
and add or update tests whenever behavior changes.
