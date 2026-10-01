# ADR 0005 — Deterministic suggestion ranking

**Status:** Accepted
**Date:** 2026-10-01

## Context

The product premise is content suggested for a learner's age, region and character.
docs/CATALOG.md §4.2 calls the matching layer the real moat, but no LLM integration exists
in the repository yet, and docs/AGENTS.md §1 commits the project to shipping a measurable
baseline before adding AI. A ranker was therefore needed that works with no model, and
that an AI enrichment pass can later improve without a rewrite.

## Decisions

### Tiered scoring, not one weighted sum

A single linear sum has no notion of _disqualifying_. With plausible weights, a paid,
French, `17-18` video with three interest hits outranks a free, age-exact `en-GB`
tutorial — which no tutor would forgive. So:

- **Hard filters** in SQL: published, safety-vetted, affordable, language-compatible,
  within the node's subtree or ancestor chain, and enriched.
- **One multiplicative gate**: age-band fit (exact 1.0 / adjacent 0.6 / two away 0.15 /
  three or more 0.0). PLAN.md §4 calls this the strongest legitimate signal, and making it
  a gate means no weight configuration lets an interest match rescue the wrong age.
- **Additive factors**: topic relevance, interest overlap, reading-level fit, confidence
  fit, media preference, quality.

### Cost can only ever count against a resource

docs/CATALOG.md §6 attaches affiliate revenue to the commercial tier. A weight file in
which paid material scored above free would be a ranker that earns money by recommending
worse material to a child's tutor. Cost therefore contributes at most zero, and a test
asserts that **no** weight configuration can make a paid resource outrank an otherwise
identical free one.

### Whole-row enrichment precedence, resolved by a view

`resource_enrichment` is keyed `(resource_id, source)` so a curated row and a model row can
coexist — the only way to measure a model against the curator who labelled the same
resource. Precedence is curated → deterministic → model, resolved by the
`resource_enrichment_current` view, and production queries read only the view.

Precedence is **whole-row, never per-column**. Coalescing columns across sources produces a
record no human reviewed — an age band from the curator beside a difficulty from the model —
leaves `difficulty` and `qualityScore` mutually inconsistent, and makes the provenance
columns meaningless. If per-field overrides are ever wanted, they should be an explicit,
enumerable override set on the model row.

The view also prevents a concrete bug: the first join written without a `source` predicate
fans out and lists one resource twice. An integration test pins that.

### Safety vetting is a filter, and a curated row cannot self-certify

Four of the five age bands are under 16, and docs/CATALOG.md §4.1 requires human
confirmation before a third-party resource is surfaceable to a minor. Vetting is a hard SQL
filter, `safety_vet_status = 'passed'` requires a non-null human `vetted_by` (enforced by
CHECK and by `checkEnrichmentProvenance`), and an audit method mirrors `auditUsageRights`.

### Gender is unrepresentable, and that is tested two ways

Neither the request schema nor the scorer input has the field. Because structural absence
alone would reduce PLAN.md §4's bias-parity promise to a determinism check, it is backed by
a boundary test (supplying `gender` returns a byte-identical body, which relies on the
schema _stripping_ unknown keys rather than rejecting them) and a static test that the
declared key set is exact and the word appears in no executable line of the ranker.

### Interests are a closed vocabulary

Free text fails silently: `"Football"`, `"football"` and `"soccer"` overlap with nothing and
the resulting list looks plausible while being wrong. `CHARACTER_FIT_TAGS` is a const tuple
validated on both the query and the write path, which also validates the curation import,
sources the web picker, and keeps unvetted free text out of any future model prompt.

### Per-key diversity caps rather than MMR

With no embeddings there is no similarity function, so an MMR term would reduce to a cap on
media type and provider anyway — with a tunable nobody can reason about and the property
that item four's position depends on items one to three. Caps are a single stable pass with
backfill, and candidates are fetched per media type so the caps have a mixed pool.

### Weights are typed, not JSON

A frozen `Record<SuggestionFactor, number>` makes adding a factor a compile error. A JSON
file would still need a pull request to change, so it buys no reviewability that the typed
record does not, and loses exhaustiveness. `weightsVersion` is echoed in every response.

## Consequences

- Turning on AI enrichment adds rows with `source: 'model'`; the ranker does not change.
- "Low confidence prefers easier material" is implemented as a **hypothesis**, with a small
  weight and an always-visible reason, pending the assignment-outcome data in
  docs/CATALOG.md §4.3. It should not be mistaken for an evidenced rule.
- Two divergences from docs/CATALOG.md §7 are settled here: enrichment arrays are
  `text[]` columns rather than a `resource_tag` table (so `&&` and GIN work naturally,
  accepting an inconsistency with the existing `resources.authors` jsonb), and topic
  relevance expresses `primary | related | ancestor` where the schema's `primary boolean`
  only distinguishes primary from not — `related` and `ancestor` are derived from the node
  path, not from the column.
- `attentionSpan` is accepted and documented but not yet scored, so the learner roster
  does not force a rename across the API, the generated client and the database.
