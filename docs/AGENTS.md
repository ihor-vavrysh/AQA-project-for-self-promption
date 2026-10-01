# Lesson Studio — multi-agent orchestration plan

A feature that runs **multiple cooperating agents** to assemble a complete,
curriculum-aligned lesson: planning, catalog research, authoring, review and
safety vetting, each by a specialist agent, fanned out and merged.

Companion to [PLAN.md](../PLAN.md) and [docs/CATALOG.md](./CATALOG.md). Read §1
before the engineering sections.

---

## 1. When multi-agent is the wrong answer

Multi-agent adds latency, cost, and a wider failure surface. A single call with a
good prompt beats a seven-agent crew for most tasks, and "we run a crew of agents"
is a sentence that impresses nobody who has had to debug one.

Four criteria decide whether a task deserves an agent at all: **complexity** (multi-step
and hard to specify in advance), **value** (does the outcome justify the cost and
latency), **viability** (is the model actually good at this), and **cost of error**
(can mistakes be caught and recovered). Lesson assembly passes; single-artefact
generation does not.

So the scope line is sharp:

| Task | Surface |
| --- | --- |
| One explainer, one worksheet, one quiz | **Single API call.** Phase 3 already does this; do not route it through an orchestrator. |
| Enrich one catalog resource | **Single call** per field group (docs/CATALOG.md §4.1). |
| **Assemble a 45-minute lesson** — plan, research the catalog, write four artefacts, review, vet, sequence | **Multi-agent.** Genuinely fan-out shaped: independent pieces, and the catalog research alone would fill one context window with reading. |

**The governing rule: ship single-agent first, and add an agent only when an eval
delta justifies it.** Every roster addition must name the metric it improves and show
the improvement on the golden set. An agent that cannot show its delta gets deleted.
This is also the honest answer to "why not just one big prompt?" — because the
measurement said so, not because crews are fashionable.

---

## 2. Where the loop runs: self-hosted or Managed Agents

There are two real options, and they differ in **who supplies the harness** (the agent
loop) and **who supplies the deployment**.

| | Self-hosted Tool Runner | Managed Agents (multiagent session) |
| --- | --- | --- |
| Agent loop | `client.beta.messages.toolRunner(...)` in NestJS | Anthropic runs it; coordinator gets delegation tools automatically |
| Deployment | Ours (Fly.io), inside the existing BullMQ workers | Anthropic hosts a per-session container |
| Access to our Postgres, catalog and learner profiles | Direct and in-process, inside our tenancy rules | Over the wire via our tools, or vault credentials |
| Provenance rows in our DB | Native — we are already in the transaction | Mirrored from the session event stream |
| Fits the existing Drizzle / BullMQ / OpenTelemetry stack | Yes | Partially |
| Scheduled autonomous runs | We build the scheduler | Built in (scheduled deployments) |

**Decision: self-hosted Tool Runner.** The agents' most valuable tools are our own
catalog search and learner profile, both of which live in our Postgres behind
multi-tenant rules, and every agent run must land a provenance row in the same
database. Handing that to a hosted sandbox means exporting our data model to reach it.

**The named trigger for revisiting:** if we want lessons refreshed autonomously on a
schedule — "re-check this lesson's resources every month, rewrite what rotted" —
Managed Agents scheduled deployments do that with no scheduler of our own, and that is
the point to move. Recorded as an open decision, not a never.

---

## 3. The roster

Six roles. Each is an agent with its own model, a narrow system prompt, and only the
tools it needs — not one agent carrying every tool.

| Agent | Model | Owns | Tools |
| --- | --- | --- | --- |
| **Lesson Lead** (coordinator) | `claude-opus-5-5` | Decomposes the request into a lesson spec, delegates, verifies what comes back, assembles and sequences | Delegation, standards lookup |
| **Catalog Scout** | `claude-haiku-4-5` | Reading-heavy work: search the catalog, read resource metadata and enrichment, shortlist by learner fit | `catalog_search`, `catalog_read` (read-only) |
| **Curriculum Mapper** | `claude-sonnet-5-5` | Maps objectives onto CASE standards from the local mirror; reports coverage and gaps | `standards_search` (read-only) |
| **Artefact Writer** | `claude-sonnet-5-5` | Writes exactly one artefact per spawn — explainer, worked examples, worksheet, or quiz | `readability_score` |
| **Pedagogy Reviewer** | `claude-sonnet-5-5` | Independent review for scaffolding, misconception handling, cognitive load | Read-only |
| **Safety Vetter** | `claude-haiku-4-5` | Age-appropriateness and safety classification; fails closed | Read-only |

Two spawn patterns matter:

- **Artefact Writers fan out in parallel** — four artefacts, four spawns, four fresh
  context windows. Only each writer's artefact comes back, so the Lead's context stays
  small.
- **Pedagogy Reviewers run several times on the same brief** for independent passes.
  The Lead de-duplicates findings and checks each against the artefact before acting —
  a reviewer finding is a claim, not an instruction.

Each roster entry needs a `name` and `description` written *for the coordinator to
read*, because the coordinator chooses whom to spawn from them. And the Lead's system
prompt must say what to hand off, to whom, how many at once, what to keep, and what is
too small to delegate. Subagents see none of the Lead's conversation, so every task
brief must carry its own paths, constraints and report format.

### What no agent may do

- **No agent writes to the database.** Only the orchestrator persists, after schema
  validation. Agents return typed artefacts; they do not mutate state.
- **No agent reaches a learner.** The tutor review gate from PLAN.md §2 is unchanged
  and non-bypassable. A lesson leaves Lesson Studio as a *draft*.
- **Delegation is one level deep.** A subagent never delegates further.

---

## 4. Orchestration

```
          tutor request
               │
        ┌──────▼───────┐
        │ Lesson Lead  │  Opus 5.5 — plan → lesson spec
        └──┬────┬───┬──┘
           │    │   └──────────────┐
   ┌───────▼─┐ ┌▼──────────────┐ ┌─▼──────────────┐
   │ Catalog │ │ Curriculum    │ │ Artefact       │  ← fan out, parallel
   │ Scout   │ │ Mapper        │ │ Writer ×4      │
   │ Haiku   │ │ Sonnet 5.5    │ │ Sonnet 5.5     │
   └───────┬─┘ └┬──────────────┘ └─┬──────────────┘
           └────┴──────┬───────────┘
                       │  fan in
              ┌────────▼─────────┐
              │ Pedagogy Reviewer│ ×2–3 independent passes
              └────────┬─────────┘
              ┌────────▼─────────┐
              │ Safety Vetter    │  ← hard gate, fails closed
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │ Lesson Lead      │  assemble + sequence
              └────────┬─────────┘
                       ▼
             draft lesson → TUTOR REVIEW (mandatory)
```

**Fan-out/fan-in runs on BullMQ flows** — a parent job per lesson, child jobs per agent
run. The queue is already in the stack from Phase 3, it gives us retries, concurrency
caps and progress for free, and a failed child does not re-run the whole lesson.

**Gates are sequential and fail closed.** Safety vetting and curriculum coverage must
pass before assembly. A failed gate produces a tutor-visible flag, never a silently
degraded lesson.

**The critic loop is bounded: at most two revision rounds**, then the Lead escalates to
the tutor with what it could not resolve. Unbounded critic loops are how an agent
feature quietly costs ten times its budget.

**Resumability.** Each agent run is idempotent and keyed, so a crashed worker resumes
from completed children rather than regenerating them.

---

## 5. API specifics — including two corrections to PLAN.md

These are the parts most likely to be written from a stale prior, so they are spelled
out. Verified against the current API reference, not recalled.

### Structured output — *not* forced tool use

PLAN.md §7 said "structured output via tool-use with a forced schema". **That is now
wrong for our models**: `tool_choice: {type: "any"}` and `{type: "tool", name: ...}`
return a **400** on Claude Opus 5.5 and Claude Sonnet 5.5. The correct shape is
structured outputs:

```ts
const result = await client.messages.parse({
  model: 'claude-sonnet-5-5',
  max_tokens: 16000,
  messages: [...],
  output_config: { format: zodOutputFormat(WorksheetArtefactSchema) },
});
```

This is a straight win for us: `zodOutputFormat` consumes the **same Zod schemas in
`@tutorforge/shared`** that already validate the HTTP boundary, so one schema governs
the API contract, the database write and the model's output. Where a tool genuinely
needs schema-valid arguments, use `tool_choice: auto` plus `strict: true` on the tool
and name the tool in the prompt.

### Models and prices

| Role | Model ID | Input $/MTok | Output $/MTok |
| --- | --- | --- | --- |
| Lead, judges | `claude-opus-5-5` | $4.00 | $20.00 |
| Mappers, writers, reviewers | `claude-sonnet-5-5` | $2.00 | $10.00 |
| Scout, safety, classification | `claude-haiku-4-5` | $1.00 | $5.00 |

Model IDs are used exactly as written — **never with a date suffix appended**. PLAN.md
and docs/CATALOG.md are updated from the older Opus 5 / Sonnet 5 generation in the same
change as this document.

### Thinking and effort

Adaptive thinking (`thinking: {type: "adaptive"}`); `budget_tokens` is removed and
returns a 400 on these models. **Claude Opus 5.5 defaults to `effort: "medium"`**, so
the Lead sets its effort explicitly rather than inheriting a default that may not suit
planning work. Subagents run at `low` effort — fewer, more consolidated tool calls and
less preamble is exactly what a narrow sub-task wants.

### The cache mechanic that shapes the whole design

**Prompt caches are model-scoped, and switching models mid-conversation invalidates the
cache.** This is the real reason the roster is built from separate agents rather than
one thread that swaps models per step: the Lead stays on one model for its whole thread
and *delegates* to a cheaper model instead of switching to it.

The stable cached prefix is the pedagogy rubric, curriculum descriptors and artefact
format spec — large, identical across lessons, and the bulk of input tokens. Volatile
content (the learner profile, the topic) goes after the last breakpoint. Operator
instructions mid-run are appended as `{role: "system"}` **messages** rather than edits
to the top-level system prompt, which preserves the cached prefix and is also the
prompt-injection-safe operator channel (§7). Verify with
`usage.cache_read_input_tokens` — a zero across repeated runs means a silent
invalidator.

### Budgets

Two independent ceilings, because they do different jobs:

- **Task budget** (beta `task-budgets-2026-03-13`, minimum 20,000 tokens, set in
  `output_config.task_budget`): *advisory*. Claude sees a countdown and paces itself to
  finish gracefully instead of being cut off.
- **Our own dollar cap per lesson**: *enforced*. The orchestrator halts delegation and
  degrades to a partial draft with a tutor-visible note.

Requests use `.stream()` with `.finalMessage()` — large `max_tokens` on a non-streaming
request risks HTTP timeouts.

### Refusals and fallbacks

A safety classifier can decline with **HTTP 200** and `stop_reason: "refusal"`. Every
agent run checks `stop_reason` *before* reading content, and requests carry server-side
fallbacks (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`) so a
refusal routes rather than failing the lesson.

### Append-only history

Thinking blocks are bound to the conversation that produced them, so the harness must
be **append-only** — never edit or re-write earlier turns to save tokens. Use context
editing or compaction for long runs instead, and keep compaction blocks in the message
history rather than extracting only text.

---

## 6. Data model and observability

```
lesson_build ── tutorId, learnerId, topicNodeId, status, costUsdTotal,
     │          budgetUsd, startedAt, finishedAt, degradedReason
     └─ agent_run ── buildId, parentRunId, role, model, effort,
                     promptVersion, inputTokens, outputTokens,
                     cacheReadInputTokens, costUsd, latencyMs,
                     stopReason, violations[], artefactId
```

Same provenance pattern as `GeneratedContent` and `resource_enrichment` — a third
consumer of the shape, which is the point of having one.

One OpenTelemetry span per agent run, parent/child linked, carrying model, role, prompt
version, tokens, cost and cache status. That trace is a **product feature, not just
telemetry**: it answers a tutor's "why did it pick this?" by showing which agent
proposed what and on what evidence. Dashboards: cost per lesson, p95 assembly latency,
cache hit rate, gate failure rate, tutor approval rate per agent role (the only quality
metric that matters), revision rounds per lesson.

---

## 7. The new attack surface this feature creates

Combining Lesson Studio with the catalog creates a risk neither feature has alone.

**Catalog resource titles and descriptions are third-party text.** Once a Catalog Scout
reads them into an agent's context, that text sits next to instructions — and some of it
was written by whoever published the resource. Same for learner profile free-text
entered by a tutor.

Mitigations, all testable:

1. All third-party text enters context inside a **delimited data block**, labelled as
   data, never as instructions.
2. **Operator instructions only via mid-conversation system messages** — the
   authority channel — never interpolated into user content.
3. **Least privilege per agent**: the Scout, Mapper, Reviewer and Vetter are read-only.
   No agent holds a write tool, so a successful injection cannot mutate state.
4. **No agent persists anything**; the orchestrator writes after schema validation.
5. The adversarial eval suite from PLAN.md §7a gains injected catalog descriptions and
   injected profile fields, and must stay at **100% blocked**.

Promoting actions to dedicated, typed tools rather than a general bash tool is what
makes 3 and 4 enforceable: the harness can gate, audit and parallelise a typed
`catalog_search` call in a way it cannot gate an opaque command string.

---

## 8. Test automation

The orchestrator is the interesting thing to test, and most of it needs no model call.

| Layer | Coverage |
| --- | --- |
| Unit | Orchestrator as a **pure state machine / reducer** — spawn decisions, gate transitions, fan-in merge, bounded revision counter, budget accounting. No model, no DB, no mocks needed |
| Unit | Cost arithmetic per model and per cache state; task-budget exhaustion path |
| Contract | Every agent's output schema, shared with the API boundary via Zod |
| Replay | **Cassette per agent run**, keyed on `(role, promptVersion, model, inputHash)` — PR CI runs the whole orchestration deterministically at zero cost |
| Integration | Full build against replayed cassettes with real Postgres and Redis; provenance rows asserted; resumability after a killed worker |
| Chaos | Injected subagent timeout, `stop_reason: "refusal"`, 429, and partial failure → assert graceful degradation with a tutor-visible reason, never a silent half-lesson |
| Adversarial | §7 injection suite; must stay 100% blocked |
| **Bias parity** | Extended again: identical lesson structure, artefact set and resource ranking across gender values |
| Cost regression | p95 cost per lesson against `evals/budgets.json`; **blocking** |
| Concurrency | Parallel spawn cap respected under load |
| Nightly, live | End-to-end lesson quality judged by `claude-opus-5-5` against a rubric, with score thresholds measured as deltas against the baseline |

Two things worth saying plainly: a deterministic replay harness is what makes a
multi-agent feature testable at all, and the state-machine extraction is what keeps
most of the logic out of reach of model non-determinism. Both are design decisions made
*for* testability, which is the whole point of this repository.

---

## 9. Phasing

Slots in after PLAN.md §13 Phase 5. Each step is independently shippable, and each must
earn the next.

| Phase | Deliverable | Est. |
| --- | --- | --- |
| **7a — Single-agent baseline** | Lesson assembly as **one** Opus 5.5 call with structured output and the full artefact schema. Golden set for lesson quality. **This is the number every later phase must beat.** | 1 w |
| **7b — Orchestrator + fan-out** | Tool Runner harness, BullMQ flows, Lead + Artefact Writers, provenance, cassette replay, state-machine tests, budgets | 2 w |
| **7c — Specialists + gates** | Catalog Scout, Curriculum Mapper, Pedagogy Reviewer, Safety Vetter; sequential gates; bounded critic loop; adversarial and bias-parity suites; trace UI | 2 w |
| **7d — Stretch** | Managed Agents scheduled deployments for autonomous lesson refresh; memory across builds; advisor pairing (Sonnet 5.5 executor + Opus 5.5 advisor) for hard subjects | open |

---

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| **Multi-agent is cargo cult** — more agents, no better lessons | §1 rule: 7a baseline first, every roster addition shows an eval delta or is deleted |
| Cost runs away | Enforced dollar cap, advisory task budget, bounded revision rounds, Haiku for reading-heavy work, model-scoped cache discipline, blocking cost regression test |
| Latency makes the feature unusable | Parallel fan-out, progress surfaced from BullMQ, p95 budget as a blocking test; a lesson is async by design and the UI says so |
| Non-determinism makes it untestable | State machine extracted pure; cassette replay keyed on inputs; live runs nightly only |
| Prompt injection via catalog or profile text | §7 — delimited data blocks, operator-channel system messages, read-only least-privilege agents, no agent writes, 100%-blocked adversarial gate |
| Debugging a failed build is miserable | One OTel span per run, parent/child linked, surfaced as a tutor-visible trace; every run has a provenance row |
| Stale API priors in our own code | This document's §5 corrections; the API reference is consulted per change, never recalled |
| A reviewer finding is wrong and the Lead acts on it | Findings are claims — the Lead verifies each against the artefact before acting |

---

## 11. Open decisions

1. **Harness** — self-hosted Tool Runner recommended (§2). Revisit when autonomous
   scheduled refresh is wanted.
2. **Reviewer count** — recommend 2 independent Pedagogy Reviewer passes; 3 if the
   eval shows the third still finds novel issues.
3. **Revision bound** — recommend 2 rounds. A product-quality dial; tune on real builds.
4. **Per-lesson dollar cap** — needs a number from 7a's measured baseline, not a guess.
5. **Does the tutor see the agent trace by default, or on demand?** Recommend on
   demand, with gate failures always surfaced.
