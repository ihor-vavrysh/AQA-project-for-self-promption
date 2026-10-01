# TutorForge — Plan

An AI-assisted content platform for education tutors, built as a **showcase of test
automation, CI/CD, and AI engineering practice**. The product is real enough to be
interesting; the engineering around it is the point.

> Status: Phase 1 — Walking skeleton in progress. Auth0 and Fly.io selected.
> This document is the contract for what gets built and in what order.

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
- **Content catalog** (§8): taxonomy-navigable pages for courses, tutorials, books, audio
  and video, hand-seeded in one subject/region wedge, with enrichment and
  assign-to-learner

### Explicitly out of MVP

Learner-facing accounts, live chat tutoring, payments, mobile apps, multi-model routing
beyond the three Claude tiers, RAG over tutor-uploaded documents (Phase 6 stretch).

For the catalog specifically: **hosting any third-party content**, automated ingestion
connectors (Phase 5b), breadth beyond the wedge, and public search indexing before
enrichment ships. Third-party video and audio are in scope as *linked and embedded*
material, never as hosted material — see docs/CATALOG.md §3.

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
| AI | **Claude API** — Sonnet 5.5 for bulk generation, Opus 5.5 for hard subjects and as eval judge, Haiku 4.5 for classification/moderation/tagging. Model IDs are used exactly as published, never with a date suffix | Real integration as agreed. Tiering is itself part of the cost story. |

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
│   ├── evals/                  ★ eval harness, golden sets, judges, reports (§7)
│   ├── taxonomy/               ISCED-F / UK-NC / CASE imports, seed data (§8)
│   └── connectors/             one adapter per content source, recorded fixtures (§8)
├── e2e/                        Playwright specs, fixtures, page objects
├── load/                       k6 scenarios
├── tools/openapi-codegen/      OpenAPI TypeScript client generator
├── infra/                      Dockerfiles, compose, Terraform, deploy manifests
├── .github/workflows/          CI/CD (§11)
├── docs/
│   ├── adr/                    architecture decision records
│   ├── MODEL_CARD.md           ★ what the AI does, limits, eval results
│   ├── CATALOG.md              content catalog plan (§8)
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

Catalog tables (`taxonomy_node`, `resource`, `resource_enrichment`, `resource_health`,
`resource_assignment`, `collection`, `topic_demand`) are specified in
[docs/CATALOG.md §7](./docs/CATALOG.md). They reuse this provenance pattern deliberately:
enrichment is model output, so it carries the same prompt version, model, token and cost
fields as `GeneratedContent`.

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
| **Judges** | Opus 5.5 rubric judges (pedagogical soundness, age-appropriateness, curriculum alignment, factual accuracy) + deterministic scorers (readability, schema validity, answer-key correctness via symbolic check) | Judge prompts are themselves versioned and have meta-evals against human-labelled samples |
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

- **Structured output** via `output_config.format` with `messages.parse()`, reusing the
  Zod schemas in `@tutorforge/shared`. Never parse prose, and **never** forced tool use:
  `tool_choice: {type: "any"}` / `{type: "tool"}` returns a 400 on Opus 5.5 and
  Sonnet 5.5. Where a tool needs schema-valid arguments, use `auto` + `strict: true`.
- **Prompt caching** on the large stable prefix (curriculum descriptors, pedagogy rubric,
  format spec) — this is the bulk of the token spend and caching it is the main cost lever.
  Caches are **model-scoped**, so a mid-conversation model switch throws the cache away:
  delegate a sub-task to a cheaper model instead of switching to it (§9).
- **Semantic + exact cache**: exact-hash cache on the normalised request; the DB is checked
  before the model is called. Cache hit rate is a tracked metric.
- **Two-stage pipeline**: Sonnet 5.5 generates → Haiku 4.5 classifies (age-appropriateness,
  safety, difficulty, readability) → fail closed into a tutor-visible flag. Opus 5.5 is used
  for advanced-level subjects and for judging, not for bulk.
- **Retries** with jittered backoff on 429/529; **circuit breaker** with a clear degraded
  state in the UI rather than a spinner that never ends.
- **Cost meter** per org with a soft cap, surfaced in the tutor UI. A showcase that
  demonstrates awareness of unit economics stands out.
- **Deterministic CI**: a record/replay cassette layer (`AI_MODE=replay`) fixes PR runs to
  recorded responses — zero cost, zero flake. Live calls happen nightly and on demand.

---

## 8. Content catalog — courses, tutorials, books, audio, video

Public and in-app pages for courses, tutorials, references (books), audio and video
materials across a comprehensive subject taxonomy. **Full plan:
[docs/CATALOG.md](./docs/CATALOG.md)** — read its §1 first, because it changes the build
order the request implies.

The short version:

- **The catalog is not the moat.** Every category is already free and SEO-dominant
  elsewhere. The defensible product is *matching* — "for this learner, what next?" — not a
  directory. The catalog is the substrate; §4's personalization is the product.
- **Taxonomy breadth is cheap; catalog depth is not.** Build the whole tree on day one
  (ISCED-F 2013 for fields, UK National Curriculum / SCED for school subjects, 1EdTech
  CASE for standards alignment, schema.org `LearningResource`/LRMI for resource metadata).
  Then light one **wedge** — recommended: UK GCSE/KS3–4 maths and sciences — and gate every
  other node behind a **depth threshold**, rendering it as "request this topic" until it
  earns publication. That button is free demand discovery.
- **Never host third-party content.** Three usage tiers: open/public-domain (deep-link and
  mirror), embed-permitted (official embed only), commercial (metadata plus affiliate link
  only). `licence` and `usage_tier` are mandatory non-null columns enforced by a database
  constraint *and* a failing build — the highest-value tests in the repo.
- **Enrichment is the unique value**: age-band fit, readability, prerequisite concepts,
  standards alignment and character-fit tags computed per resource by the Phase 3 AI core,
  with the same provenance and eval discipline as generated content. It is simultaneously
  what makes a page worth ranking and what makes recommendation possible.
- **Seed by hand before building ingestion.** ~300 curated wedge resources via reviewed CSV
  validates the pages, the enrichment value and the acquisition thesis in two weeks. The
  connector framework comes after that proves out, not before.
- **Commercially**, public catalog pages are a distribution channel feeding tutor SaaS
  signups. Affiliate revenue (Coursera 15–45%, edX 5–10%, Udemy 8%) is real but small
  enough that it must not shape a single product decision.

Personalization rules carry over without exception: **gender affects representation only
and never resource selection or ranking**, and the §4 bias-parity eval is extended to
assert identical ranked resource lists across gender values.

---

## 9. Multi-agent orchestration — Lesson Studio

A feature that runs **multiple cooperating agents** to assemble a complete lesson:
planning, catalog research, authoring four artefacts in parallel, independent pedagogy
review, and safety vetting. **Full plan: [docs/AGENTS.md](./docs/AGENTS.md).**

The short version:

- **Most tasks do not need this.** A single call with a good prompt beats a crew. One
  explainer, one worksheet, one enrichment pass — all stay single-call. Only *lesson
  assembly* is genuinely fan-out shaped, and the governing rule is **ship the
  single-agent baseline first and add an agent only when an eval delta justifies it**;
  an agent that cannot show its delta gets deleted.
- **Six specialists, not one agent with every tool**: Lesson Lead (Opus 5.5) plans,
  delegates, verifies and assembles; Catalog Scout (Haiku 4.5) does the reading-heavy
  catalog research; Curriculum Mapper and Artefact Writers (Sonnet 5.5) map standards
  and write one artefact per spawn; Pedagogy Reviewers run several independent passes;
  Safety Vetter (Haiku 4.5) is a hard gate that fails closed.
- **Self-hosted harness**, not a hosted sandbox: the agents' most valuable tools are our
  own catalog and learner profiles, which live in our Postgres behind tenancy rules, and
  every run must land a provenance row. Fan-out runs on the Phase 3 BullMQ flows.
- **No agent writes to the database and no agent reaches a learner.** Agents return
  typed artefacts; the orchestrator persists after schema validation; the tutor review
  gate in §2 is unchanged and non-bypassable.
- **Cost is bounded twice**: an advisory task budget so the model paces itself, and an
  enforced per-lesson dollar cap that degrades to a partial draft with a visible reason.
  Revision loops are capped at two rounds.
- **The catalog creates a new attack surface.** Third-party resource descriptions become
  prompt-injection vectors once an agent reads them, so all third-party text enters
  context as delimited data, operator instructions travel only as mid-conversation
  system messages, and every subagent is read-only.
- **Testability is a design constraint, not an afterthought**: the orchestrator is a
  pure state machine unit-testable without a model call, and every agent run replays
  from a cassette keyed on `(role, promptVersion, model, inputHash)` so PR CI runs the
  whole orchestration deterministically at zero cost.

---

## 10. Test automation strategy

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
| **Catalog legal invariants** | Custom tests + DB `CHECK` | No null `licence`/`usage_tier`; Tier C never exposes embed or full text; Tier B never stored | PR | **Blocking** |
| Connector contract | Recorded fixtures per source; nightly live drift check | Each content source adapter | PR (replay) + nightly (live) | Blocking |
| Dedup quality | Precision/recall on a labelled fixture set | Canonicalisation + fuzzy matching | PR | Blocking on threshold |
| Structured data | schema.org JSON-LD validation | Every public catalog template | PR | Blocking |
| SEO / perf | Lighthouse CI budgets, sitemap shard + canonical checks | Catalog pages | PR | Blocking on budget breach |
| Link health | Nightly sweep + depth-gate regression | All catalog resources | Nightly | Alert + auto-tombstone |
| Smoke | Playwright subset against deployed env | Staging & prod | Post-deploy | Blocking → auto-rollback |

Principles: **no mocking of the database** (Testcontainers instead); **no sleeps** in E2E
(wait on real signals from the job queue); **quarantine, never skip** — a flaky test moves
to a tracked quarantine job with a 7-day expiry that fails the build if unresolved.

---

## 11. CI/CD

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

Infra target: **Fly.io**, with Postgres managed and Redis managed when Phase 3 needs
the generation queue. The official Fly Terraform provider is archived and does not
support Managed Postgres, so staging uses Fly-native `fly.toml` configuration and
GitHub Actions rather than an unmaintained provider. Revisit Terraform if a
maintained provider becomes available or the hosting target changes.

---

## 12. Observability

OpenTelemetry traces end to end, with the AI call as a first-class span carrying model,
prompt version, token counts, cost, and cache status. Structured JSON logs with request
correlation and **prompt/response bodies redacted by default**. Dashboards: generation
success rate, p50/p95 latency, cost per generation, cache hit rate, tutor approval rate
(the real quality metric), eval scores over time. Sentry for errors. Alerts on cost
anomalies and approval-rate drops.

---

## 13. Delivery phases

Sized for one engineer with AI assistance. Each phase ends green and deployable.

| Phase | Deliverable | Est. |
| --- | --- | --- |
| **0 — Foundations** | Monorepo, Turborepo, strict TS, lint/format, Docker Compose dev stack, `pr.yml` skeleton running lint + a trivial test, CLAUDE.md, first ADRs | 3–4 d |
| **1 — Walking skeleton** | Nest API + Angular shell, auth (OIDC via Auth0 or Keycloak), Drizzle schema + migrations, one real endpoint, OpenAPI generation + typed client, Testcontainers integration test, one Playwright E2E, deploy to staging. **CI/CD is fully wired before any feature work.** | 1.5 w |
| **2 — Domain** | Orgs, tutors, learner roster with the four profile dimensions, lesson shell; full unit + integration coverage; a11y baseline | 1.5 w |
| **2a — Catalog: taxonomy + wedge** | Taxonomy spine imported (ISCED-F, UK NC, wedge topics), CASE framework mirror, catalog data model, ~300 hand-curated wedge resources via reviewed CSV, topic hub + five media-type templates + resource detail, faceted search, JSON-LD, sharded sitemap, licence/takedown pages, depth gate, "request a topic". `noindex` until 4b. | 3 w |
| **3 — AI core** | Prompt registry, orchestrator, structured output, Claude integration, BullMQ job pipeline, provenance recording, cassette record/replay, cost meter, moderation stage | 2 w |
| **4 — Review loop + evals** | Draft → review → edit → approve → publish UI; `packages/evals` harness, golden set v1, judges, bias-parity suite, budgets; eval jobs in PR and nightly; model card | 2 w |
| **4b — Catalog: enrichment + matching** | Enrichment pipeline on the Phase 3 core (age-band fit, readability, prerequisites, standards alignment, character-fit tags, safety vet), recommendation panel, assign + outcome capture, enrichment evals, bias parity extended to ranking, indexing enabled | 2 w |
| **5 — Hardening & showcase polish** | Mutation testing, k6, security scans, SBOM + provenance, preview environments, blue/green + rollback, eval trend site on GitHub Pages, README with architecture diagrams and a 3-minute demo video | 1.5 w |
| **5b — Catalog: connectors + ops** | Connector framework; Gutendex (self-hosted), LibriVox, OpenStax/LibreTexts/OER Commons, YouTube Data API, Open Library bulk import; dedup; link-health monitoring; spot-check queue | 2.5 w |
| **7a — Single-agent lesson baseline** | Lesson assembly as one Opus 5.5 call with the full artefact schema, plus a lesson-quality golden set. The number every agent must beat | 1 w |
| **7b — Orchestrator + fan-out** | Tool Runner harness, BullMQ flows, Lead + parallel Artefact Writers, provenance, cassette replay, state-machine tests, budgets | 2 w |
| **7c — Specialists + gates** | Catalog Scout, Curriculum Mapper, Pedagogy Reviewers, Safety Vetter, sequential gates, bounded critic loop, adversarial and bias-parity suites, trace UI | 2 w |
| **6 — Stretch** | Feedback flywheel (mine `ReviewDecision` and `resource_assignment` outcomes into ranking and the golden set), curated pathways, demand-driven node lighting, affiliate wiring, second region, RAG over tutor-uploaded curriculum docs, multilingual output, offline worksheet PDF export | open |

**MVP through Phase 5: roughly 9–10 weeks without the catalog, 16–17 weeks with it.**
Phases 0–1 are the ones not to rush; a showcase project that adds CI at the end always
looks like it. The catalog phases are deliberately interleaved rather than appended: 2a
ships pages against hand-seeded data, 4b adds the AI enrichment that makes them worth
indexing, and only 5b automates ingestion. Each is independently shippable, so the catalog
can be stopped after 2a or 4b without leaving a half-built module.

---

## 14. Definition of done for the showcase

- [ ] `git clone && pnpm i && pnpm dev` works from a cold machine, documented in the README
- [ ] Green badge set: CI, coverage, eval score, security
- [ ] A deliberately broken PR demo branch showing each gate catching its class of failure
- [ ] Eval report and trend charts live on GitHub Pages
- [ ] `docs/MODEL_CARD.md` with real numbers from a real eval run
- [ ] ADRs explaining the five decisions a reviewer would question
- [ ] A 3-minute demo video: generate → review → publish, plus the bias-parity test failing
      on a deliberately biased prompt and passing after the fix
- [ ] Publicly deployed staging instance with seeded demo data
- [ ] One catalog wedge that looks *finished* — every published node past the depth gate,
      zero dead links, visible last-verified dates
- [ ] A CI run demonstrating the licence invariant failing the build on an unlicensed resource

---

## 15. Risks

| Risk | Mitigation |
| --- | --- |
| Live LLM calls make CI slow, costly, flaky | Replay cassettes on PRs; live only nightly, cost-capped, with a hard spend alert |
| Eval judges are themselves noisy | Deterministic scorers where possible (readability, schema, symbolic answer-key checks); judges meta-evaluated against human labels; thresholds use score *deltas* vs. baseline, not absolutes |
| Scope creep — the product eats the showcase | MVP fence in §2 is firm. Phase 6 is where ideas go. |
| Children's data compliance | §4: pseudonymous handles, no learner PII in prompts, tutor-mediated only, data minimisation, deletion path, documented lawful basis |
| Model output quality is the product risk | Human-in-the-loop approval is mandatory and non-bypassable in MVP; tutor approval rate is the headline metric |
| Prompt injection via profile free-text | Profile fields are delimited and treated as data, never instructions; adversarial suite must stay 100% blocked |
| Catalog breadth dilutes the whole project | docs/CATALOG.md §1: full taxonomy, one lit wedge, depth gate enforced in code rather than by intention. If the catalog starts setting the roadmap, stop building it |
| Copyright exposure from third-party books, audio, video | Never host; three usage tiers; mandatory non-null `licence`/`usage_tier` with a blocking CI test; takedown policy live before the first public page |
| Third-party content unsuitable for minors | AI pre-screen plus mandatory human confirmation before anything is surfaceable under 16; tutor-mediated assignment only |
| Link rot and provider API withdrawal | Nightly health sweep, tombstones not 404s, isolated connector adapters, `source_terms_verified_at` with quarterly re-review, self-host what becomes load-bearing |
| Multi-agent becomes cargo cult — more agents, no better lessons | docs/AGENTS.md §1: single-agent baseline first, every roster addition shows an eval delta or is removed |
| Agent cost or latency runs away | Enforced per-lesson dollar cap, advisory task budget, bounded revision rounds, Haiku for reading-heavy work, blocking cost-regression test |
| Prompt injection through catalog or profile text into agent context | Delimited data blocks, operator-channel system messages, read-only least-privilege agents, no agent writes, 100%-blocked adversarial gate |
| The gender dimension reads badly to a reviewer | §4 makes the position explicit and the bias-parity test makes it demonstrable — turning the riskiest requirement into the strongest artifact |

---

## 16. Open decisions

1. **Auth provider** — Auth0 selected for Phase 1; self-hosted Keycloak was deferred.
2. **Hosting** — Fly.io selected. Use native Fly app configuration and GitHub Actions;
   the official Terraform provider is archived and does not manage Postgres.
3. **Preview environments** — real value, real cost. Phase 5, cut if time is short.
4. **Regions in MVP** — recommend three: `en-GB/KS3`, `en-US/CommonCore`, `uk-UA/NUS`.
   Enough to prove the abstraction without drowning in curriculum research.
5. ~~**Repository**~~ — **Decided:** built in a clean repository
   (`ihor-vavrysh/aqa-project-for-self-promption`) rather than the original scratch repo.
6. **The catalog wedge** — recommend UK GCSE/KS3–4 maths and the three sciences, `en-GB`:
   paying-tutor density, exam-driven urgency, and public specifications that make curriculum
   alignment objectively checkable. A founder's call, not an engineering one; the
   architecture is wedge-agnostic and only the seed data changes.
7. **Depth gate threshold** — recommend ≥12 enriched resources spanning ≥3 media types
   before a taxonomy node is published and indexed. A product-quality dial; tune on real pages.
8. **Taxonomy hierarchy storage** — Postgres `ltree` vs. a closure table. Recommend `ltree`
   for the read-heavy subtree queries this module is made of.
9. **Catalog indexing timing** — recommend building pages in Phase 2a but holding `noindex`
   until enrichment lands in 4b. The ranking case depends on enrichment existing, and a
   premature crawl of thin pages is expensive to undo.
10. **Agent harness** — self-hosted Tool Runner recommended over Managed Agents, because
    the agents' tools are our own database. Revisit if autonomous scheduled lesson
    refresh becomes wanted; see docs/AGENTS.md §2.
11. **Per-lesson cost cap** — needs a number measured from the Phase 7a baseline rather
    than guessed.
