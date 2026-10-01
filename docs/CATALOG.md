# Content Catalog — plan

Public and in-app pages for **courses, tutorials, references (books), audio and video
materials**, organised by a comprehensive subject taxonomy seeded from existing standards
rather than invented here.

Companion to [PLAN.md](../PLAN.md). Read §1 before the engineering sections — it changes
what gets built.

---

## 1. The founder's read: why "all possible categories" is the wrong build order

The ask was breadth: every category, every media type. The instinct is right about the
*destination* and wrong about the *sequence*, and getting the sequence wrong is how content
startups burn a quarter. Three things are worth saying plainly before any schema design.

### 1.1 The catalog is not the moat

Every category of educational content is already indexed, free, and SEO-dominant —
YouTube, Khan Academy, Wikipedia, Coursera, Google itself. A directory that competes on
breadth competes with infinite free inventory and loses. Breadth-first produces the
classic failure: six months of ingestion work, a shallow directory where most pages have
four dead links, no search rankings, and not one tutor who changes their behaviour.

What no competitor has is the answer to this question:

> *For this specific learner — 13, `en-GB/KS3`, visual learner, low confidence, into
> football — what should they read, watch or do next, and why?*

That is a **matching** problem, not a directory problem. The catalog is the substrate.
The matching is the product. Everything below is organised around that distinction.

### 1.2 Separate taxonomy breadth from catalog depth

"All possible categories" conflates two things with wildly different costs:

| | Cost | Decision |
| --- | --- | --- |
| **Taxonomy breadth** — the full tree of fields, subjects, topics, tags | Days. It is metadata. | **Build it all, now.** Comprehensive from day one. |
| **Catalog depth** — vetted, enriched, link-checked resources under each node | Enormous. ~80 detailed fields × 5 education levels × 5 media types ≈ thousands of nodes; at a credible 20 resources each that is 100k+ curated items. | **Light a wedge.** Everything else stays dark. |

So: **full tree, lit wedge.** The entire taxonomy is navigable and real, but a node is
only *published* — indexed, linked, promised content — once it passes a **depth gate**
(proposed: ≥12 enriched, health-checked resources spanning ≥3 media types). Below the
gate a node renders as an explicit "not covered yet — request this topic" state.

That request button is not a consolation prize. It is **free demand discovery**: it tells
you which categories tutors actually want before you spend a week ingesting them. The
cold-start problem becomes a market-research instrument. Build that button in Phase 2a,
and store the result as a persisted `topic_demand` signal so the next wedge is prioritised
by evidence, not instinct.

Three product red lines keep the plan honest:

- no learner-facing accounts or content hosting before the tutor workflow is proven;
- no public indexing before the node passes the depth gate;
- no connector automation before the manual wedge proves the matching quality and trust loop.

### 1.3 The depth gate is also an SEO requirement

The commercial case for *public* catalog pages (§6) is organic acquisition through
long-tail search. That only works if each page carries genuine unique value. Thin
aggregator pages assembled at scale are precisely what search engines' scaled-content
policies target, and shipping 8,000 near-empty pages is more likely to earn a sitewide
penalty than traffic.

The depth gate and the SEO requirement are the same constraint arriving from two
directions. That is the useful structural insight in this document: **publish fewer, richer
pages than the taxonomy technically permits**, and let demand decide what gets lit next.

### 1.4 The wedge

Recommendation: **UK GCSE / Key Stage 3–4 maths and the three sciences, `en-GB`.**

- High density of *paying* tutors
- Exam-driven urgency — parents buy outcomes, not enrichment
- Tight, public specifications, so curriculum alignment is objectively checkable rather
  than a matter of taste
- Small enough that 300 hand-curated resources make it look *complete*, which is the only
  state in which a catalog builds trust

Expand along one axis at a time afterwards: adjacent subjects first (cheaper — same
curriculum framework), then adjacent regions (`en-US/CommonCore`, `uk-UA/NUS`).

This is an open decision — see PLAN.md §16 — and it is a founder's call, not an
engineering one. The architecture below is wedge-agnostic; only the seed data changes.

---

## 2. Taxonomy: seeded from standards, not invented

Four layers, each from an existing published source. Nothing hand-rolled.

| Layer | Source | What it gives |
| --- | --- | --- |
| **Fields spine** (post-secondary / vocational / adult) | **ISCED-F 2013** (UNESCO) — 11 broad fields, 29 narrow, ~80 detailed | A stable, international, citable top-level tree with codes |
| **School subject spine** (K-12) | UK National Curriculum subjects × Key Stages; **SCED** course codes (US NCES); state/national subject lists | ISCED-F is explicitly scoped to secondary and above and is a poor fit for primary and lower-secondary — this layer covers that gap |
| **Topic / concept layer** | Curriculum specifications (AQA, Edexcel, OCR, Common Core, NUS) plus **Wikidata** concept URIs for linking and multilingual labels | The level tutors actually search at ("fractions", "photosynthesis") |
| **Standards alignment** | **1EdTech CASE** (Competencies and Academic Standards Exchange) | Machine-readable "this resource teaches this specific standard" |

The 11 ISCED-F broad fields: `00` Generic programmes and qualifications · `01` Education ·
`02` Arts and humanities · `03` Social sciences, journalism and information · `04`
Business, administration and law · `05` Natural sciences, mathematics and statistics ·
`06` Information and Communication Technologies · `07` Engineering, manufacturing and
construction · `08` Agriculture, forestry, fisheries and veterinary · `09` Health and
welfare · `10` Services.

### Resource metadata vocabulary

Model resources on **schema.org `LearningResource` / LRMI** rather than a bespoke shape.
The properties that matter are already specified: `educationalAlignment` (via
`AlignmentObject`), `educationalLevel`, `educationalUse`, `teaches`, `assesses`,
`learningResourceType`, `timeRequired`, `typicalAgeRange`, `license`, `inLanguage`.

Two payoffs for one decision: the internal schema stays close to a standard other systems
already speak, and the same object serialises directly to JSON-LD for search engines (§6).

### Critical: mirror standards frameworks, never resolve them live

Standards identifiers rot. Reporting suggests the entire ASN (Achievement Standards
Network) identifier set — tens of thousands of US K-12 standard URIs, the very scheme LRMI's
`educationalAlignment` was designed around — is now dead. CASE is the successor
specification.

So: **import CASE frameworks into our own `curriculum_standard` table and serve from
there.** Never put a third-party standards URI on a request path. Re-import on a schedule,
diff, and alert on changes. This is a small decision that prevents a whole class of
catastrophic future breakage, and the ASN precedent is the evidence.

### Tags vs. taxonomy

Keep these separate and resist the urge to merge them:

- **Taxonomy nodes** — curated, hierarchical, slow-moving, URL-bearing, SEO-relevant.
- **Tags** — flat, fast-moving, non-URL-bearing. Two kinds: *descriptive* (`exam-practice`,
  `visual`, `hands-on`, `revision`) and **character-fit tags** (`football`, `space`,
  `music`, `gaming`) that feed the §4 matching layer.

Character-fit tags are the direct bridge from the catalog to the character profile in
PLAN.md §4 — the same dimension that drives generated content also drives curation.

---

## 3. Sources, and the licensing tiers that govern them

**We never host third-party content.** Hosting books, audio or video means copyright
liability, storage cost and bandwidth cost, for zero differentiation. Every resource is
classified into exactly one usage tier, and the tier dictates what the product may do.

| Tier | Rights | What we may do | Sources |
| --- | --- | --- | --- |
| **A — Open / public domain** | CC0, CC-BY, CC-BY-SA, public domain | Deep-link, excerpt, cache metadata, mirror where the licence allows; show attribution | Project Gutenberg (via Gutendex — JSON, no key, public-domain texts); LibriVox (`/api/feed/audiobooks`, all audio public domain, reusable commercially); OpenStax; LibreTexts; OER Commons; MIT OpenCourseWare; Internet Archive |
| **B — Embed-permitted** | Platform ToS grants embedding | Official embed only. Metadata via the documented API. **Never** download-and-rehost | YouTube (Data API v3 + official iframe embed); podcasts via public RSS; Vimeo |
| **C — Commercial** | All rights reserved | **Metadata, cover image and outbound link only** — plus an affiliate parameter (§6) | Commercial books (ISBN metadata); Coursera; edX; Udemy |

### Three source-specific findings that change the design

1. **Open Library is not a backend.** Its own terms state the APIs are intended for
   open-source and mission-aligned discovery tools and are **"not intended to serve as a
   data backend for third-party services."** Its bibliographic metadata is CC0, and it
   publishes bulk data dumps. So: **one-time bulk import from the dumps**, refreshed on a
   schedule — not live API calls on a request path. Respecting this both honours the terms
   and gives us better latency.
2. **Gutendex** is a community-hosted instance of an MIT-licensed open-source project.
   Convenient to start with, but a single volunteer-run host is not a dependency to build a
   product on — **self-host it** (it is designed to be self-hosted) before it is load-bearing.
3. **LibriVox** is explicitly non-commercial and ad-free as a *project*, while its
   *recordings* are public domain and free to reuse commercially. Both facts are true and
   the distinction matters: use the audio freely, do not hammer their servers, and cache.

### The one engineering decision that matters most here

`licence` and `usage_tier` are **mandatory, non-null, enumerated** columns on every
resource, enforced by a database `CHECK` constraint *and* a test that fails the build if any
row lacks them. No resource enters the catalog without known rights. Retrofitting rights
metadata onto a 50,000-row catalog is not a task anyone recovers from cheaply — and the
legal exposure in the interim is the kind that ends companies, not sprints.

Every connector must also record `source_terms_verified_at`. A standing task per connector:
re-read the provider's ToS and rate limits at implementation time and on a quarterly
schedule. The summaries in this document are research notes with a shelf life, not legal
clearance.

---

## 4. The actual moat: the enrichment and matching layer

Ingesting a resource is commodity work. What follows is not, and it is the reason this
module belongs in *this* product rather than in a generic directory.

### 4.1 Enrichment (runs once per resource, cached, provenance-tracked)

Reusing the Phase 3 AI core — same prompt registry, same structured-output contract, same
cost meter, same provenance pattern as `GeneratedContent`:

| Field | How | Tier |
| --- | --- | --- |
| `reading_level`, `readability_score` | Deterministic scorer (Flesch-Kincaid et al.) on extracted text — no model needed | — |
| `age_band_fit[]` | Haiku 4.5 classification, deterministic scorer as a cross-check | Haiku |
| `difficulty`, `prerequisite_concepts[]` | Sonnet 5.5 against the topic's concept graph | Sonnet |
| `standard_alignment[]` | Sonnet 5.5 against locally mirrored CASE frameworks (§2) | Sonnet |
| `character_fit_tags[]` | Haiku 4.5 — maps content themes onto the interest vocabulary | Haiku |
| `quality_score`, `summary` | Sonnet 5.5 rubric; summary is ours, written for tutors, not scraped | Sonnet |
| `safety_vet_status` | Haiku 4.5 pre-screen → **human confirmation required** before any resource is surfaceable for a learner under 16 | Haiku + human |

Enrichment is **the unique value on every public page** — the thing that makes a catalog
page more than a link list, and therefore the thing that makes §1.3's SEO case legitimate
rather than wishful.

### 4.2 Matching

`recommendNext(learner, topic)` ranks candidate resources against the full learner
profile — age band, locale/curriculum, character profile, confidence — using enrichment
fields plus observed efficacy (§4.3). Same personalization rules as PLAN.md §4 apply
without exception: **gender affects representation only and must never influence
difficulty, pacing, or topic and resource selection.** The §4 bias-parity eval is extended
to cover recommendation output, asserting that ranked resource lists are identical across
gender values.

### 4.3 The efficacy flywheel

`resource_assignment` records a tutor assigning a resource to a learner, and the outcome
(`worked` / `partially` / `didn't land` + reason). Within a year this is proprietary data
nobody can scrape: *which* specific video actually works for a low-confidence 13-year-old
on this topic. It feeds ranking, and it compounds. It is the second moat, after enrichment,
and it costs almost nothing to start collecting — so collect it from the first catalog
release even before anything consumes it.

---

## 5. Pages

Two surfaces, one data layer: a **public** surface for acquisition and a **tutor** surface
for work. The public surface shows enrichment but gates assignment behind sign-in.

### Public

| Route | Purpose |
| --- | --- |
| `/learn` | Catalog root — the 11 broad fields plus the school-subject entry point |
| `/learn/:broad[/:narrow[/:detailed]]` | Taxonomy navigation; published nodes only, with the un-lit state from §1.2 |
| `/learn/:path/:topic` | **Topic hub — the money page.** Our overview, prerequisite chain, standards alignment, then resources tabbed by media type |
| `/learn/:path/:topic/courses` · `/tutorials` · `/books` · `/audio` · `/video` | Per-media-type listings, each with its own template and its own facets (books get ISBN/author/edition; audio and video get duration and transcript availability; courses get provider, cost and length) |
| `/resource/:slug` | Resource detail — enrichment, licence and attribution, last-verified date, outbound/embed, "assign to a learner" CTA |
| `/pathways/:slug` | Curated ordered sequences across media types — high value and genuinely hard to copy |
| `/study-plan` | No-login planner for adult learners to choose published resources and build a browser-only study plan; includes an example purchase link for Eric Berne’s *Ігри у які грають люди* on Rozetka |
| `/search` | Faceted search: media type, age band, licence, language, curriculum, duration, cost |
| `/licences`, `/takedown`, `/content-policy` | Attribution, DMCA process, and the vetting policy. **Ship with the first public page, not after.** |

### Tutor (in-app)

Resource shelf per learner · "Assign resource" from any resource or topic hub · **"What
next" recommendation panel** (§4.2) · outcome capture (§4.3) · "request a topic" (§1.2) ·
side-by-side *generate new content* vs. *assign existing resource* — the moment the catalog
and the AI generator stop being two features and become one product.

### Page requirements

Every public page carries schema.org JSON-LD (`LearningResource`, `Course`, `Book`,
`AudioObject`, `VideoObject`, `BreadcrumbList`), a visible **last-verified date**, correct
licence attribution, canonical URL, and an entry in a sharded sitemap. All page templates
are subject to the existing blocking a11y gate (WCAG 2.2 AA).

---

## 6. Business model — honestly

Three revenue lines. Being clear-eyed about their relative size is the point of this section.

1. **Tutor SaaS subscription — the business.** Per-seat. The catalog is an acquisition and
   retention feature, not a product. Everything else is rounding.
2. **Programmatic SEO → acquisition.** The real commercial reason to build *public* pages.
   Thousands of long-tail pages, each with a "generate a worksheet for this topic" CTA that
   converts a searching tutor into a trial. Not revenue — **cheap distribution**, which for
   a bootstrapped product matters more. Conditional on §1.3 discipline.
3. **Affiliate — pocket money, wire it anyway.** Verified rates: Coursera 15–45% via Impact
   (30-day cookie), edX 5–10% (60-day cookie), Udemy 8% (7-day cookie), plus Amazon
   Associates on books. The honest read: on an early-stage education catalog, intent is low,
   volume is low, and Udemy's 7-day window is unforgiving. Worth adding because the marginal
   cost once a link field exists is near zero; **not worth planning around, and not worth
   one hour of product compromise.** Any founder modelling an affiliate directory into
   meaningful revenue at this stage is fooling themselves.

Cost side: Tier A and B content is free to reference, so catalog COGS is dev time plus
one-time LLM enrichment per resource (cached forever, and the §7 budget caps it). No
licensing fees, no storage, no CDN bills. That is the whole reason for the §3 tiering — it
keeps the catalog's marginal cost near zero, which is what makes it viable to build at all
as a funnel rather than a product.

---

## 7. Data model additions

```
taxonomy_node ── id, parent_id, scheme (isced-f | uk-nc | sced | internal),
     │           code, slug, names jsonb (i18n), level, depth_gate_passed bool,
     │           published_at   ← ltree or closure table for subtree queries
     ├─ curriculum_standard ── framework (CASE import), jurisdiction, code,
     │                         statement, education_level, node_ids[]
     └─ resource_taxonomy ── resource_id, node_id, relevance (primary | related)

resource ── id, slug, title, description, canonical_url, embed_url,
     │      media_type (course | tutorial | book | audio | video | reference),
     │      provider, authors[], language, isbn, doi, duration_s, page_count,
     │      cost_model (free | freemium | paid), price_hint,
     │      licence NOT NULL, usage_tier NOT NULL CHECK (A|B|C),   ← §3
     │      attribution_text, affiliate_program, affiliate_url,
     │      source_connector, source_terms_verified_at, first_seen_at
     ├─ resource_enrichment ── age_band_fit[], reading_level, readability_score,
     │                         difficulty, prerequisite_concepts[],
     │                         character_fit_tags[], quality_score, summary,
     │                         safety_vet_status, vetted_by, vetted_at,
     │                         prompt_version, model, tokens, cost_usd  ← provenance
     ├─ resource_health ── last_checked_at, http_status, consecutive_failures,
     │                     state (live | degraded | dead | tombstoned)
     ├─ resource_assignment ── learner_id, tutor_id, assigned_at,
     │                         outcome (worked | partially | didnt_land), reason  ← §4.3
     └─ collection / collection_item ── curated pathways, ordered

topic_demand ── node_id, requested_by, requested_at, count   ← §1.2 demand discovery
resource_tag ── resource_id, tag_id, kind (descriptive | character_fit)
```

Mirrors the existing `GeneratedContent` provenance pattern deliberately: enrichment is
model output, so it carries the same prompt version, model, token and cost fields and is
governed by the same eval discipline.

---

## 8. Ingestion — and why it is not built first

**Phase 2a seeds the catalog by hand.** ~300 resources in the wedge, via a reviewed CSV
import. Two weeks, near-zero infrastructure, and it validates the page design, the
enrichment value and the SEO thesis before a single connector exists.

Writing an ingestion platform for a catalog nobody has validated is the most reliable way
to spend a quarter and learn nothing. Do it manually, then automate what demonstrably works.

Once the pages prove out, the **connector framework** (Phase 5b):

```
Connector (one adapter per source)
  → fetch (respect rate limits, conditional requests, backoff)
  → normalise to the LRMI-shaped internal schema
  → canonicalise + dedup (ISBN / DOI / normalised URL, then fuzzy title+author)
  → licence + usage-tier resolution  ← hard fail if indeterminate, never default
  → AI enrichment (§4.1, cached by content hash)
  → human spot-check queue (sampled; 100% for anything learner-facing under 16)
  → publish, then re-evaluate the node's depth gate
```

**Link rot is an operational cost, not an edge case.** Third-party content disappears
constantly. Required from the first connector: a nightly health checker, soft-delete with
tombstones (never a 404 on an indexed URL — redirect to the topic hub), the last-verified
date shown publicly as a trust signal, and an alert when a node falls back below its depth
gate so a published page never silently decays into a dead-link farm.

---

## 9. Test automation — what this module adds

This module is the strongest QA-showcase surface in the project: many external
dependencies, a large faceted search space, data-driven correctness, and legal invariants
that are genuinely worth enforcing in CI.

| Layer | Added coverage |
| --- | --- |
| Unit | Taxonomy tree operations, slug generation and stability, dedup key canonicalisation, readability scorers, facet query building |
| **Legal invariants** | **Build fails if any resource row has null `licence`/`usage_tier`, if a Tier C resource exposes an embed or full text, or if a Tier B resource is stored rather than embedded.** The highest-value tests in the repo |
| Connector contract | Recorded fixtures per source (no live calls on PRs); schema-conformance and pagination tests; a nightly live job that opens a PR when a provider's response shape drifts |
| Dedup quality | Precision/recall against a hand-labelled fixture set, with thresholds |
| Integration (Testcontainers) | Subtree queries at depth, facet counts, depth-gate transitions, tombstone redirects |
| Enrichment evals | Age-band and difficulty accuracy against a human-labelled golden set; readability cross-checked against the deterministic scorer; extends the existing eval harness and its gates |
| **Bias parity** | Extended to recommendation output: ranked resource lists must be identical across gender values |
| Structured data | JSON-LD validity per page template, asserted against schema.org |
| SEO / perf | Lighthouse CI budgets on catalog templates; sitemap shard generation and size limits; canonical-tag correctness; no-indexing of un-lit nodes |
| E2E (Playwright) | Browse → facet → resource detail → assign to learner → capture outcome |
| a11y | All new templates, WCAG 2.2 AA, blocking (existing gate) |
| Nightly | Link-health sweep; depth-gate regression; standards-framework re-import diff |

---

## 10. Phasing

Slots into PLAN.md §13. Enrichment deliberately follows the Phase 3 AI core.

| Phase | Deliverable | Est. |
| --- | --- | --- |
| **2a — Taxonomy + hand-seeded wedge** | Full taxonomy spine imported (ISCED-F + UK NC + wedge topics), CASE mirror, data model, ~300 hand-curated wedge resources via reviewed CSV, topic hub + all five media-type templates + resource detail, faceted search, JSON-LD, sitemap, licence/takedown pages, depth gate, "request a topic" | 3 w |
| **4b — Enrichment + matching** | Enrichment pipeline on the Phase 3 AI core, recommendation panel, assignment + outcome capture, enrichment evals, bias parity extended to ranking | 2 w |
| **5b — Connectors + operations** | Connector framework; Gutendex (self-hosted), LibriVox, OpenStax/LibreTexts/OER Commons, YouTube Data API, Open Library bulk import; dedup; health monitoring; spot-check queue | 2.5 w |
| **6 — Compounding** | Pathways, demand-driven node lighting, affiliate wiring, second region, efficacy-informed ranking | open |

Phase 2a ships a catalog that looks finished in one wedge. That is worth more, commercially
and as a portfolio piece, than a comprehensive catalog that looks abandoned everywhere.

---

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| **Breadth-first dilutes everything** | §1.2 depth gate, enforced in code, not by intention |
| **Thin-content SEO penalty** | Enrichment is the unique value; depth gate blocks indexing of weak nodes; un-lit nodes carry `noindex` |
| **Google dependency** | SEO is one channel, not the plan. Tutor-direct and referral run in parallel; a ranking collapse must not be existential |
| **Copyright / DMCA** | §3 tiering, mandatory licence columns with CI enforcement, no hosting, takedown policy live before the first public page |
| **Minors + third-party content** | AI pre-screen plus mandatory human confirmation before anything is surfaceable under 16; tutor-mediated assignment only |
| **Link rot** | §8 health monitoring, tombstones, public last-verified dates, depth-gate regression alerts |
| **Third-party identifier rot** | §2 — mirror CASE locally; the dead ASN identifier set is the cautionary precedent |
| **Provider ToS change or API withdrawal** | Connectors are isolated adapters; `source_terms_verified_at` plus quarterly re-review; self-host what becomes load-bearing |
| **Enrichment cost at scale** | Cache by content hash, Haiku for classification, deterministic scorers wherever a model is not required, per-run budget caps in the existing budget file |
| **Catalog becomes a second product** | It is a funnel and a retention feature. If it starts setting the roadmap, that is the signal to stop building it |

---

## 12. Open decisions

1. **The wedge** (§1.4) — recommend UK GCSE/KS3–4 maths + sciences. Founder's call.
2. **Depth gate threshold** — recommend ≥12 resources across ≥3 media types. Tune on real
   pages; it is a product-quality dial, not a constant.
3. **Public catalog before or after auth-gated MVP?** Recommend building the pages in
   Phase 2a but `noindex` until enrichment lands in 4b — the SEO case depends on enrichment
   existing, and a premature crawl is hard to undo.
4. **Taxonomy hierarchy storage** — Postgres `ltree` vs. closure table. Recommend `ltree`:
   simpler for the read-heavy subtree queries this module is made of.
5. **Self-host Gutendex from the start, or start on the public instance?** Recommend
   starting public, self-hosting before Phase 5b makes it load-bearing.
