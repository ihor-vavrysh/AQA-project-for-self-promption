# TutorForge — Plan

An AI-assisted content platform for education tutors, built as a **showcase of test
automation, CI/CD, and AI engineering practice**. The product is real enough to be
interesting; the engineering around it is the point.

> Status: plan only. No code has been written yet. This document is the contract for
> what gets built and in what order.

---

## 1. The showcase thesis

A reviewer who clones this repo should be able to answer these in ten minutes:

| Question | Where they find the answer |
| --- | --- |
| Does this person test properly? | A real pyramid — unit, integration against a live DB, contract, E2E, a11y, load, mutation. Not 400 unit tests and zero integration. |
| Can they ship? | One green pipeline from PR to production, with gates, environments, and rollback. |
| Do they understand LLMs beyond "call the API"? | Versioned prompts, structured output contracts, a golden-set eval suite that runs in CI, cost/latency budgets, caching, and a bias-parity check that can fail the build. |
| Do they think about users? | Human-in-the-loop approval before anything reaches a child, plus an explicit, defensible stance on personalization ethics (§4). |
| Is the AI itself testable? | Deterministic CI via recorded responses; nightly live evals with score thresholds and trend reports published as build artifacts. |

Everything below serves those five answers.

---

## 2. Product scope

**The user is the tutor, not the learner.** Tutors manage learner profiles, request
generated material, review and edit it, then publish it into a lesson. Learners (often
minors) never receive raw model output.

### MVP (Phases 1–4)

- Tutor auth, org/tenant, learner roster
- Learner profile: age band, region/locale, character profile, subject and level,
  optional self-declared gender (§4)
- Content generation: explainer, worked example set, practice worksheet, quiz with answer key
- Generation is **drafted** → tutor reviews/edits → **approved** → published to a lesson
- Provenance record on every generated item (prompt version, model, tokens, cost, safety flags)
- Tutor feedback (accept / edit / reject + reason) captured as eval signal

### Explicitly out of MVP

Learner-facing accounts, live chat tutoring, payments, video, mobile apps, multi-model
routing beyond the three Claude tiers, RAG over tutor-uploaded documents (Phase 6 stretch).

---

## 3. Architecture

```
┌─────────────────────┐        ┌──────────────────────────┐
│  Angular SPA        │ HTTPS  │  Node API (NestJS + TS)   │
│  standalone comps   │───────▶│  REST + OpenAPI 3.1       │
│  signals, typed API │        │  Zod-validated boundaries │
│  client generated   │        └────────┬─────────┬────────┘
│  from OpenAPI       │                 │         │
└─────────────────────┘                 │         │
                              ┌─────────▼──┐   ┌──▼─────────────┐
                              │ PostgreSQL │   │ BullMQ + Redis │
                              │ (Drizzle)  │   │ generation jobs │
                              └────────────┘   └──┬─────────────┘
                                                  │
                                        ┌─────────▼──────────┐
                                        │ AI Orchestrator     │
                                        │ prompt registry     │
                                        │ structured output   │
                                        │ cache + cost meter  │
                                        │ moderation pass     │
                                        └─────────┬──────────┘
                                                  │
                                         ┌────────▼────────┐
                                         │  Claude API      │
                                         │ opus-5 / sonnet-5│
                                         │ / haiku-4-5      │
                                         └─────────────────┘
```

### Stack decisions

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | **Angular 20+** (pin newest stable at scaffold time), standalone components, signals, typed reactive forms | You asked for Angular; modern Angular is what a showcase should demonstrate. AngularJS 1.x has been EOL since Jan 2022. |
| Backend | **NestJS on Node 22 LTS**, TypeScript strict | DI container makes the AI layer trivially mockable in tests — the single most important property for this project. |
| DB | **PostgreSQL 16 + Drizzle ORM** | Typed schema shared with the app; migrations are plain SQL and reviewable in PRs. |
| Queue | **BullMQ + Redis** | Generation is slow (5–30s). Async jobs with progress are the honest design, and they give the E2E suite something real to wait on. |
| Contracts | **OpenAPI 3.1 generated from Nest decorators**; Angular client generated from it | One source of truth. A drift check in CI fails the build if the committed spec is stale. |
| Monorepo | **pnpm workspaces + Turborepo** | Fast, cacheable CI; simple enough to read. |
| AI | **Claude API** — Sonnet 5 for bulk generation, Opus 5 for hard subjects and as eval judge, Haiku 4.5 for classification/moderation/tagging | Real integration as agreed. Tiering is itself part of the cost story. |

---

## 4. Personalization — and an honest position on the gender dimension

You asked for content adapted to **gender, age, character, and region**. Three of those
are uncontroversial. The fourth needs a deliberate design, and I'd rather build the
defensible version than the naive one — the naive version is a liability in a product
touching children, and in a showcase it reads as a lack of judgement rather than a feature.

### The four dimensions as designed

| Dimension | Values | What it actually changes |
| --- | --- | --- |
| **Age band** | 5–7, 8–10, 11–13, 14–16, 17–18 | Reading level (target Flesch-Kincaid range), sentence length, concept scaffolding depth, worked-example count, abstraction level. The strongest and most legitimate signal. |
| **Region / locale** | ISO locale + curriculum code (e.g. `en-GB/KS3`, `uk-UA/NUS`, `en-US/CommonCore`) | Curriculum alignment and terminology, units (metric/imperial), currency, spelling, date formats, culturally familiar names/places/contexts in examples, public holidays and seasonal references. High-value and objectively verifiable. |
| **Character profile** | Tutor-set tags: interests (football, space, music, gaming…), learning preference (visual / narrative / step-by-step / challenge-first), confidence level, attention span | Framing and hooks. A fractions worksheet themed around football fixtures vs. a music-playlist theme. This is where the felt personalization actually comes from. |
| **Gender** | Optional, self-declared, free-entry with common presets, defaults to unset | **Representation only**: pronouns for named characters in narrative problems, and balance of protagonists across a worksheet so a learner sees people like themselves doing the maths. |

### What gender explicitly does *not* do

Hard-coded as invariants in the prompt layer **and asserted by tests**:

- It never changes difficulty, pace, subject steering, or topic recommendation.
- It never selects themes (no "football for boys, ponies for girls"). Themes come from the
  character profile only, which the tutor sets from what the learner actually likes.
- It never appears in the model's reasoning about the learner's ability.
- Unset is a first-class value and the default — the system must produce excellent content
  with the field empty.

### How this is enforced (this is the interesting part)

A **bias-parity eval** in the test suite: generate the same content request across all
gender values with everything else held constant, then assert:

1. Readability scores are within tolerance (±0.5 grade level)
2. Difficulty classification (Haiku judge) is identical
3. Topic/theme tags are identical
4. Only pronouns and character names differ — verified by a structural diff
5. Stereotype probe set: known-trap prompts ("a worksheet about careers", "a story about
   someone good at maths") produce representation-balanced output across runs

Failing parity **fails the build**. This is a genuinely rare thing to find in a portfolio
repo and it's the single artifact most likely to start a conversation in an interview.

### Compliance context

Learner records are children's data. The plan assumes **GDPR Art. 8 / UK Children's Code /
COPPA** posture from day one: tutor-entered profiles only (no learner self-registration in
MVP), documented lawful basis, data minimisation on the profile fields, a deletion path,
and no learner PII in prompts (learners are referenced by pseudonymous handle — the model
sees "Learner, age band 11–13, en-GB/KS3", never a real name).

---

## 5. Repository layout

```
tutorforge/
├── apps/
│   ├── api/                    NestJS service
│   │   ├── src/modules/        auth, tenants, learners, content, review, lessons
│   │   ├── src/ai/             orchestrator, providers, cache, cost meter
│   │   └── test/               integration tests (Testcontainers)
│   └── web/                    Angular app
│       ├── src/app/features/   roster, generate, review-queue, lesson-builder
│       └── src/app/shared/     generated API client, design system
├── packages/
│   ├── shared/                 Zod schemas + inferred TS types, shared by api & web
│   ├── prompts/                ★ versioned prompt artifacts (§7)
│   └── evals/                  ★ eval harness, golden sets, judges, reports (§7)
├── e2e/                        Playwright specs, fixtures, page objects
├── load/                       k6 scenarios
├── infra/                      Dockerfiles, compose, Terraform, deploy manifests
├── .github/workflows/          CI/CD (§9)
├── docs/
│   ├── adr/                    architecture decision records
│   ├── MODEL_CARD.md           ★ what the AI does, limits, eval results
│   └── TESTING.md              the strategy, for humans
└── CLAUDE.md                   ★ repo conventions for AI coding agents
```

★ = AI artifact, versioned and reviewed like source code.

---

## 6. Data model (core tables)

```
Organisation ─┬─ User (tutor, admin)
              └─ Learner
                   ├─ ageBand, locale, curriculumCode
                   ├─ characterProfile (jsonb: interests[], preference, confidence)
                   ├─ gender (nullable, self-declared)
                   └─ pseudonymousHandle

ContentRequest ── learnerId, contentType, subject, topic, objectives[], constraints
      │           status: queued → generating → drafted → in_review → approved | rejected
      ▼
GeneratedContent ── requestId, structured body (jsonb, schema-validated)
      │             provenance: promptId + promptVersion, model, inputTokens,
      │             outputTokens, costUsd, latencyMs, cacheHit, safetyFlags[],
      │             readabilityScore, seed
      ▼
ReviewDecision ── reviewerId, action (approve | edit | reject), editDiff, reasonCode
      │           ← this table is the eval flywheel: real tutor judgements
      ▼
Lesson ── orderedContentIds[], publishedAt
```

`ReviewDecision` deserves attention: every tutor edit is a labelled example of "the model
got this wrong, here's the fix". Phase 6 mines it to grow the golden set automatically.

---

## 7. AI artifacts — treated as source code

This is what "incorporated AI artifacts" means in practice here. Two categories.

### 7a. Product AI artifacts (`packages/prompts`, `packages/evals`)

| Artifact | Form | Reviewed how |
| --- | --- | --- |
| **Prompt templates** | `prompts/<id>/v<N>.md` with YAML front matter: model tier, temperature, max tokens, output schema ref, changelog | PR diff. A prompt change is a code change and needs a passing eval run. |
| **Output schemas** | Zod schemas in `packages/shared`, mirrored as JSON Schema for tool-use structured output | Type errors and schema-validity tests |
| **Golden set** | `evals/datasets/*.jsonl` — ~150 curated request/expectation pairs spanning every age band × 3 locales × 4 content types, plus edge cases | PR review; additions required when a bug is found |
| **Judges** | Opus 5 rubric judges (pedagogical soundness, age-appropriateness, curriculum alignment, factual accuracy) + deterministic scorers (readability, schema validity, answer-key correctness via symbolic check) | Judge prompts are themselves versioned and have meta-evals against human-labelled samples |
| **Eval reports** | HTML + JSON score reports per run, published to GitHub Pages with trend charts | Build artifact on every run |
| **Adversarial suite** | Prompt-injection attempts in learner profile fields, jailbreaks, requests for age-inappropriate content, PII leakage probes | Must stay at 100% blocked |
| **Bias-parity suite** | §4 | Must pass |
| **Model card** | `docs/MODEL_CARD.md` — intended use, out-of-scope use, eval scores, known failure modes, human-oversight requirement | Updated every release |
| **Cost/latency budget** | `evals/budgets.json` — p95 latency and cost-per-generation ceilings | Enforced as a test |

### 7b. AI in the development workflow

- `CLAUDE.md` — architecture, conventions, and test commands so AI coding agents produce
  in-house-looking code
- **Claude Code review job** on every PR, posting inline findings
- AI-drafted test cases for new endpoints, reviewed by a human before merge
- AI-generated release notes from the commit range
- `docs/adr/` decision records — several will be AI-drafted, human-approved, and that's
  documented honestly rather than hidden

### Engineering details worth planning up front

- **Structured output** via tool-use with a forced schema. Never parse prose.
- **Prompt caching** on the large stable prefix (curriculum descriptors, pedagogy rubric,
  format spec) — this is the bulk of the token spend and caching it is the main cost lever.
- **Semantic + exact cache**: exact-hash cache on the normalised request; the DB is checked
  before the model is called. Cache hit rate is a tracked metric.
- **Two-stage pipeline**: Sonnet 5 generates → Haiku 4.5 classifies (age-appropriateness,
  safety, difficulty, readability) → fail closed into a tutor-visible flag. Opus 5 is used
  for advanced-level subjects and for judging, not for bulk.
- **Retries** with jittered backoff on 429/529; **circuit breaker** with a clear degraded
  state in the UI rather than a spinner that never ends.
- **Cost meter** per org with a soft cap, surfaced in the tutor UI. A showcase that
  demonstrates awareness of unit economics stands out.
- **Deterministic CI**: a record/replay cassette layer (`AI_MODE=replay`) fixes PR runs to
  recorded responses — zero cost, zero flake. Live calls happen nightly and on demand.

---

## 8. Test automation strategy

| Layer | Tool | Scope | Where it runs | Gate |
| --- | --- | --- | --- | --- |
| Static | ESLint, Prettier, `tsc --strict`, `knip` (dead code) | Whole repo | PR | Blocking |
| Unit — backend | **Vitest** | Services, prompt builders, scorers, domain rules | PR | Blocking, ≥85% on `src/ai` and domain |
| Unit — frontend | **Vitest + Angular TestBed** | Components, signals stores, pipes | PR | Blocking |
| Integration | **Vitest + Testcontainers** (real Postgres + Redis) | Repositories, migrations, job queue, transactional behaviour | PR | Blocking |
| Contract | OpenAPI drift check + **Schemathesis** fuzz against the spec | API surface | PR | Blocking |
| E2E | **Playwright**, 4-way sharded, Chromium + WebKit | Roster → generate → review → publish; auth; error and degraded states | PR | Blocking |
| Accessibility | **axe-core** inside Playwright, WCAG 2.2 AA | Every route | PR | Blocking on serious/critical |
| Visual regression | Playwright screenshots | Key screens | PR | Non-blocking, reviewed |
| AI evals — fast | Golden-set subset in replay mode + schema validity + bias parity | `packages/evals` | PR | Blocking |
| AI evals — full | Full golden set, live API, judge scoring, adversarial suite, cost/latency budgets | `packages/evals` | Nightly + `/eval` comment | Blocking on threshold regression |
| Mutation | **Stryker** on domain + AI orchestrator | Proves the unit tests bite | Nightly | Blocking below score threshold |
| Load | **k6** — generation endpoint under concurrency, queue saturation | `load/` | Nightly + pre-release | Blocking on p95 breach |
| Security | CodeQL, `pnpm audit`, **gitleaks**, **Trivy** image scan, dependency review | Whole repo | PR + nightly | Blocking on high/critical |
| Smoke | Playwright subset against deployed env | Staging & prod | Post-deploy | Blocking → auto-rollback |

Principles: **no mocking of the database** (Testcontainers instead); **no sleeps** in E2E
(wait on real signals from the job queue); **quarantine, never skip** — a flaky test moves
to a tracked quarantine job with a 7-day expiry that fails the build if unresolved.

---

## 9. CI/CD

GitHub Actions. Three workflows.

### `pr.yml` — target under 12 minutes wall clock

```
      ┌── lint + typecheck ──┐
      ├── unit (api) ────────┤
trigger ─ unit (web) ────────┼─▶ build ─▶ ┌─ integration (Testcontainers) ─┐
      ├── ai-evals (replay) ─┤            ├─ e2e shard 1..4 + a11y ────────┼─▶ PR gate
      └── security scans ────┘            └─ contract fuzz ────────────────┘
```

- Turborepo remote cache + pnpm store cache; affected-only where safe, full run on `main`
- Every job publishes artifacts: coverage (merged, posted as a PR comment via sticky bot),
  Playwright HTML report + traces + videos on failure, eval score report with diff vs.
  `main` baseline
- Claude Code review job comments inline
- Concurrency group cancels superseded runs

### `main.yml` — continuous delivery

```
merge to main
  → full test suite
  → semantic-release (conventional commits → version + changelog)
  → build multi-arch Docker images → GHCR
  → SBOM (CycloneDX) + SLSA build provenance attestation
  → deploy STAGING (migrations run as a pre-deploy job)
  → smoke tests + seeded E2E against staging
  → nightly full AI eval gate must be green
  → manual approval (GitHub Environment protection rule)
  → deploy PRODUCTION, blue/green
  → post-deploy smoke; auto-rollback on failure
```

### `nightly.yml`

Full live AI eval suite (cost-capped), mutation testing, k6 load, dependency review,
cassette refresh PR when recorded responses drift from live behaviour, eval trend report
published to GitHub Pages.

### Environments

| Env | Trigger | Data | Notes |
| --- | --- | --- | --- |
| Preview | Every PR | Seeded ephemeral | Optional Phase 5; one container + branch DB |
| Staging | Merge to `main` | Seeded, synthetic learners only | Live Claude API, low cost cap |
| Production | Manual approval | Real | Blue/green, feature flags, cost alerting |

Infra target: **Fly.io or AWS ECS Fargate**, Terraform-managed, Postgres and Redis managed.
Fly.io keeps the showcase cheap to actually run; the Terraform is portable either way.

---

## 10. Observability

OpenTelemetry traces end to end, with the AI call as a first-class span carrying model,
prompt version, token counts, cost, and cache status. Structured JSON logs with request
correlation and **prompt/response bodies redacted by default**. Dashboards: generation
success rate, p50/p95 latency, cost per generation, cache hit rate, tutor approval rate
(the real quality metric), eval scores over time. Sentry for errors. Alerts on cost
anomalies and approval-rate drops.

---

## 11. Delivery phases

Sized for one engineer with AI assistance. Each phase ends green and deployable.

| Phase | Deliverable | Est. |
| --- | --- | --- |
| **0 — Foundations** | Monorepo, Turborepo, strict TS, lint/format, Docker Compose dev stack, `pr.yml` skeleton running lint + a trivial test, CLAUDE.md, first ADRs | 3–4 d |
| **1 — Walking skeleton** | Nest API + Angular shell, auth (OIDC via Auth0 or Keycloak), Drizzle schema + migrations, one real endpoint, OpenAPI generation + typed client, Testcontainers integration test, one Playwright E2E, deploy to staging. **CI/CD is fully wired before any feature work.** | 1.5 w |
| **2 — Domain** | Orgs, tutors, learner roster with the four profile dimensions, lesson shell; full unit + integration coverage; a11y baseline | 1.5 w |
| **3 — AI core** | Prompt registry, orchestrator, structured output, Claude integration, BullMQ job pipeline, provenance recording, cassette record/replay, cost meter, moderation stage | 2 w |
| **4 — Review loop + evals** | Draft → review → edit → approve → publish UI; `packages/evals` harness, golden set v1, judges, bias-parity suite, budgets; eval jobs in PR and nightly; model card | 2 w |
| **5 — Hardening & showcase polish** | Mutation testing, k6, security scans, SBOM + provenance, preview environments, blue/green + rollback, eval trend site on GitHub Pages, README with architecture diagrams and a 3-minute demo video | 1.5 w |
| **6 — Stretch** | Feedback flywheel (mine `ReviewDecision` into the golden set), RAG over tutor-uploaded curriculum docs, multilingual output, offline worksheet PDF export | open |

**MVP through Phase 5: roughly 9–10 weeks.** Phases 0–1 are the ones not to rush; a
showcase project that adds CI at the end always looks like it.

---

## 12. Definition of done for the showcase

- [ ] `git clone && pnpm i && pnpm dev` works from a cold machine, documented in the README
- [ ] Green badge set: CI, coverage, eval score, security
- [ ] A deliberately broken PR demo branch showing each gate catching its class of failure
- [ ] Eval report and trend charts live on GitHub Pages
- [ ] `docs/MODEL_CARD.md` with real numbers from a real eval run
- [ ] ADRs explaining the five decisions a reviewer would question
- [ ] A 3-minute demo video: generate → review → publish, plus the bias-parity test failing
      on a deliberately biased prompt and passing after the fix
- [ ] Publicly deployed staging instance with seeded demo data

---

## 13. Risks

| Risk | Mitigation |
| --- | --- |
| Live LLM calls make CI slow, costly, flaky | Replay cassettes on PRs; live only nightly, cost-capped, with a hard spend alert |
| Eval judges are themselves noisy | Deterministic scorers where possible (readability, schema, symbolic answer-key checks); judges meta-evaluated against human labels; thresholds use score *deltas* vs. baseline, not absolutes |
| Scope creep — the product eats the showcase | MVP fence in §2 is firm. Phase 6 is where ideas go. |
| Children's data compliance | §4: pseudonymous handles, no learner PII in prompts, tutor-mediated only, data minimisation, deletion path, documented lawful basis |
| Model output quality is the product risk | Human-in-the-loop approval is mandatory and non-bypassable in MVP; tutor approval rate is the headline metric |
| Prompt injection via profile free-text | Profile fields are delimited and treated as data, never instructions; adversarial suite must stay 100% blocked |
| The gender dimension reads badly to a reviewer | §4 makes the position explicit and the bias-parity test makes it demonstrable — turning the riskiest requirement into the strongest artifact |

---

## 14. Open decisions

1. **Auth provider** — Auth0 (fast, free tier, looks professional) vs. self-hosted Keycloak
   (more to show, more to maintain). Leaning Auth0.
2. **Hosting** — Fly.io (cheap, simple, fine for a demo) vs. AWS ECS + RDS (more
   enterprise-credible, costs real money to leave running). Leaning Fly.io with portable Terraform.
3. **Preview environments** — real value, real cost. Phase 5, cut if time is short.
4. **Regions in MVP** — recommend three: `en-GB/KS3`, `en-US/CommonCore`, `uk-UA/NUS`.
   Enough to prove the abstraction without drowning in curriculum research.
5. **Repository** — build this in `ihor-vavrysh/test` or start a clean `tutorforge` repo?
   A showcase benefits from a clean history and a purposeful name.
