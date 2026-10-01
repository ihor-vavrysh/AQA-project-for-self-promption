import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  AGE_BANDS,
  AGE_BAND_READING_LEVEL,
  CHARACTER_FIT_TAGS,
  CONFIDENCE_LEVELS,
  COST_MODELS,
  DIVERSITY_CAPS,
  INTEREST_OVERLAP_CAP,
  LearnerContextSchema,
  MEDIA_TYPES,
  SCORER_CONTEXT_KEYS,
  SUGGESTION_FACTORS,
  SUGGESTION_WEIGHTS,
  ageGate,
  applyDiversityCaps,
  checkEnrichmentProvenance,
  rankSuggestions,
  rewardWeightTotal,
  round4,
  scoreResource,
} from '../dist/index.js';

const candidate = (overrides = {}) => ({
  id: '00000000-0000-0000-0000-000000000001',
  slug: 'a-resource',
  title: 'A Resource',
  description: null,
  mediaType: 'tutorial',
  provider: 'OpenStax',
  language: 'en-GB',
  licence: 'cc0',
  usageTier: 'open',
  costModel: 'free',
  durationSeconds: null,
  pageCount: null,
  lastVerifiedAt: null,
  topicMatch: 'primary',
  ageBandFit: ['11-13'],
  readingLevel: AGE_BAND_READING_LEVEL['11-13'],
  difficulty: 'core',
  characterFitTags: [],
  qualityScore: 0.8,
  enrichmentSource: 'curated',
  ...overrides,
});

const context = (overrides = {}) =>
  LearnerContextSchema.parse({
    node: 'ks4-maths-algebra',
    ageBand: '11-13',
    locale: 'en-GB',
    ...overrides,
  });

// --- Gender: structurally absent, and provably so ---------------------------

test('the scorer context has no gender field', () => {
  assert.ok(!SCORER_CONTEXT_KEYS.includes('gender'));
  // The declared key set is the contract; a new field must be added here consciously.
  assert.deepEqual([...SCORER_CONTEXT_KEYS].sort(), [
    'ageBand',
    'allowPaid',
    'attentionSpan',
    'confidence',
    'interests',
    'learningPreference',
    'locale',
  ]);
});

test('the request schema strips gender rather than accepting it', () => {
  const parsed = LearnerContextSchema.parse({
    node: 'ks4-maths-algebra',
    ageBand: '11-13',
    locale: 'en-GB',
    gender: 'female',
  });
  assert.ok(!('gender' in parsed));
});

test('gender appears nowhere in the ranker source', () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../src/suggestions.ts'),
    'utf8',
  );
  // Only the comments explaining the prohibition may mention it.
  const offending = source
    .split('\n')
    .filter((line) => /gender/i.test(line))
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line));
  assert.deepEqual(offending, []);
});

test('ranking is identical whether or not a gender is supplied', () => {
  const candidates = [
    candidate({ slug: 'one', characterFitTags: ['football'] }),
    candidate({ slug: 'two', mediaType: 'video', readingLevel: null }),
  ];
  const withGender = rankSuggestions(
    candidates,
    LearnerContextSchema.parse({
      node: 'ks4-maths-algebra',
      ageBand: '11-13',
      locale: 'en-GB',
      gender: 'male',
      interests: ['football'],
    }),
  );
  const without = rankSuggestions(
    candidates,
    context({ interests: ['football'] }),
  );
  assert.equal(JSON.stringify(withGender), JSON.stringify(without));
});

// --- Weights ----------------------------------------------------------------

test('weights cover exactly the declared factors', () => {
  assert.deepEqual(
    Object.keys(SUGGESTION_WEIGHTS).sort(),
    [...SUGGESTION_FACTORS].sort(),
  );
});

test('reward weights sum to one so scores stay comparable', () => {
  assert.ok(Math.abs(rewardWeightTotal(SUGGESTION_WEIGHTS) - 1) < 1e-9);
});

// --- The age-band gate ------------------------------------------------------

test('the age gate steps down with distance and closes beyond two bands', () => {
  assert.equal(ageGate({ ageBandFit: ['11-13'] }, '11-13').level, 'exact');
  assert.equal(ageGate({ ageBandFit: ['8-10'] }, '11-13').level, 'adjacent');
  assert.equal(ageGate({ ageBandFit: ['5-7'] }, '11-13').level, 'distant');
  assert.equal(ageGate({ ageBandFit: ['17-18'] }, '5-7').multiplier, 0);
  assert.equal(ageGate({ ageBandFit: [] }, '11-13').multiplier, 0);
});

test('a resource three age bands away scores exactly zero but still explains itself', () => {
  const result = scoreResource(
    candidate({ ageBandFit: ['17-18'] }),
    context({ ageBand: '5-7' }),
  );
  assert.equal(result.score, 0);
  assert.equal(result.gate.level, 'none');
  assert.ok(result.reasons.length > 0, 'suppression is still explained');
});

test('only candidates beyond the gate boundary are dropped from the list', () => {
  const ranked = rankSuggestions(
    [
      // Two bands away still scores, heavily suppressed.
      candidate({ slug: 'two-bands-away', ageBandFit: ['11-13'] }),
      // Four bands away is gated to zero and must not appear at all.
      candidate({ slug: 'four-bands-away', ageBandFit: ['17-18'] }),
    ],
    context({ ageBand: '5-7' }),
  );

  assert.deepEqual(
    ranked.map((item) => item.resource.slug),
    ['two-bands-away'],
  );
  assert.equal(ranked[0].gate.level, 'distant');
});

// --- The pathology a linear sum would allow ---------------------------------

test('a wrong-age resource with strong interest overlap ranks below an age-exact one', () => {
  const ranked = rankSuggestions(
    [
      candidate({
        slug: 'wrong-age-great-interests',
        ageBandFit: ['17-18'],
        characterFitTags: ['football', 'sport', 'gaming'],
      }),
      candidate({ slug: 'age-exact-no-interests', ageBandFit: ['11-13'] }),
    ],
    context({ interests: ['football', 'sport', 'gaming'] }),
  );

  assert.equal(ranked[0].resource.slug, 'age-exact-no-interests');
});

// --- Cost can only ever count against a resource ----------------------------

test('no weight configuration lets a paid resource outrank an identical free one', () => {
  const configurations = [
    SUGGESTION_WEIGHTS,
    { ...SUGGESTION_WEIGHTS, cost: 0 },
    { ...SUGGESTION_WEIGHTS, cost: 1 },
    { ...SUGGESTION_WEIGHTS, cost: -0.5 },
  ];

  for (const weights of configurations) {
    const free = scoreResource(
      candidate({ costModel: 'free' }),
      context(),
      weights,
    );
    const freemium = scoreResource(
      candidate({ costModel: 'freemium' }),
      context(),
      weights,
    );
    const paid = scoreResource(
      candidate({ costModel: 'paid' }),
      context(),
      weights,
    );

    assert.ok(
      paid.score <= free.score,
      `paid <= free for cost=${weights.cost}`,
    );
    assert.ok(freemium.score <= free.score);
    assert.ok(paid.score <= freemium.score);
  }
});

test('cost never contributes positively', () => {
  for (const costModel of COST_MODELS) {
    const { reasons } = scoreResource(candidate({ costModel }), context());
    const cost = reasons.find((reason) => reason.factor === 'cost');
    assert.ok(cost.contribution <= 0, `${costModel} contribution <= 0`);
  }
});

// --- Monotonicity -----------------------------------------------------------

/** Each ladder is worst-to-best for one factor, holding everything else fixed. */
const ladders = {
  'topic-relevance': ['none', 'ancestor', 'related', 'primary'].map(
    (topicMatch) => ({
      overrides: { topicMatch },
    }),
  ),
  'interest-overlap': [[], ['football'], ['football', 'sport', 'gaming']].map(
    (characterFitTags) => ({ overrides: { characterFitTags } }),
  ),
  'reading-level-fit': [12, 9, 6].map((readingLevel) => ({
    overrides: { readingLevel },
  })),
  'confidence-fit': ['stretch', 'core', 'foundation'].map((difficulty) => ({
    overrides: { difficulty },
  })),
  'media-preference': ['book', 'tutorial'].map((mediaType) => ({
    overrides: { mediaType, readingLevel: 6 },
  })),
  quality: [0.1, 0.5, 0.9].map((qualityScore) => ({
    overrides: { qualityScore },
  })),
  cost: ['paid', 'freemium', 'free'].map((costModel) => ({
    overrides: { costModel },
  })),
};

test('improving any single factor never lowers the score', () => {
  const ctx = context({
    interests: ['football', 'sport', 'gaming'],
    confidence: 'low',
    learningPreference: 'step-by-step',
  });

  for (const [factor, steps] of Object.entries(ladders)) {
    let previous = -Infinity;
    for (const step of steps) {
      const { score } = scoreResource(candidate(step.overrides), ctx);
      assert.ok(
        score >= previous,
        `${factor}: ${JSON.stringify(step.overrides)} scored ${score} < ${previous}`,
      );
      previous = score;
    }
  }
});

// --- Bounds -----------------------------------------------------------------

test('scores stay within [0,1] across the full input cross-product', () => {
  let checked = 0;
  for (const ageBand of AGE_BANDS) {
    for (const confidence of CONFIDENCE_LEVELS) {
      for (const mediaType of MEDIA_TYPES) {
        for (const costModel of COST_MODELS) {
          const { score } = scoreResource(
            candidate({ mediaType, costModel, ageBandFit: [ageBand] }),
            context({ ageBand, confidence }),
          );
          assert.ok(score >= 0 && score <= 1, `score ${score} out of range`);
          checked += 1;
        }
      }
    }
  }
  assert.equal(
    checked,
    AGE_BANDS.length *
      CONFIDENCE_LEVELS.length *
      MEDIA_TYPES.length *
      COST_MODELS.length,
  );
});

// --- Reason soundness -------------------------------------------------------

test('the reasons add up to the score, so the explanation is true', () => {
  for (const mediaType of MEDIA_TYPES) {
    for (const ageBandFit of [['11-13'], ['8-10'], ['5-7']]) {
      const result = scoreResource(
        candidate({ mediaType, ageBandFit, costModel: 'paid' }),
        context({ interests: ['football'] }),
      );
      const subtotal = result.reasons.reduce(
        (total, reason) => total + reason.contribution,
        0,
      );
      const expected = round4(
        Math.min(1, Math.max(0, subtotal * result.gate.multiplier)),
      );
      assert.equal(result.score, expected, `${mediaType} / ${ageBandFit}`);
    }
  }
});

test('every declared factor produces exactly one reason', () => {
  const { reasons } = scoreResource(candidate(), context());
  assert.deepEqual(
    reasons.map((reason) => reason.factor).sort(),
    [...SUGGESTION_FACTORS].sort(),
  );
});

test('reading-level fit is marked not-applicable for video and audio', () => {
  for (const mediaType of ['video', 'audio']) {
    const { reasons } = scoreResource(
      candidate({ mediaType, readingLevel: null }),
      context(),
    );
    const reading = reasons.find((r) => r.factor === 'reading-level-fit');
    assert.equal(reading.level, 'not-applicable');
    assert.equal(reading.contribution, 0);
  }
});

test('skipping reading level redistributes its weight instead of penalising video', () => {
  const textual = scoreResource(
    candidate({ mediaType: 'tutorial' }),
    context(),
  );
  const video = scoreResource(
    candidate({ mediaType: 'video', readingLevel: null }),
    context({ learningPreference: 'step-by-step' }),
  );
  // Video loses the media-preference match here, so it should not score higher — but it
  // must not be crushed by a zero reading-level term either.
  assert.ok(
    video.score > textual.score * 0.6,
    `video ${video.score} vs ${textual.score}`,
  );
});

// --- Interest overlap -------------------------------------------------------

test('interest overlap is capped so tag-spam cannot dominate', () => {
  const capped = scoreResource(
    candidate({ characterFitTags: CHARACTER_FIT_TAGS.slice(0, 8) }),
    context({ interests: CHARACTER_FIT_TAGS.slice(0, 8) }),
  );
  const atCap = scoreResource(
    candidate({
      characterFitTags: CHARACTER_FIT_TAGS.slice(0, INTEREST_OVERLAP_CAP),
    }),
    context({ interests: CHARACTER_FIT_TAGS.slice(0, 8) }),
  );
  assert.equal(capped.score, atCap.score);
});

test('overlap is reported as not-requested when the learner has no interests', () => {
  const { reasons } = scoreResource(candidate(), context({ interests: [] }));
  const overlap = reasons.find((r) => r.factor === 'interest-overlap');
  assert.equal(overlap.level, 'not-requested');
});

// --- Determinism ------------------------------------------------------------

test('ranking is invariant to candidate input order', () => {
  const candidates = [
    candidate({ slug: 'alpha', qualityScore: 0.5 }),
    candidate({ slug: 'bravo', qualityScore: 0.5 }),
    candidate({ slug: 'charlie', qualityScore: 0.9 }),
    candidate({ slug: 'delta', mediaType: 'video', readingLevel: null }),
  ];
  const forward = rankSuggestions(candidates, context({ limit: 4 }));
  const reversed = rankSuggestions(
    [...candidates].reverse(),
    context({ limit: 4 }),
  );
  const rotated = rankSuggestions(
    [...candidates.slice(2), ...candidates.slice(0, 2)],
    context({ limit: 4 }),
  );

  assert.equal(JSON.stringify(forward), JSON.stringify(reversed));
  assert.equal(JSON.stringify(forward), JSON.stringify(rotated));
});

test('equal scores break ties by slug', () => {
  const ranked = rankSuggestions(
    [candidate({ slug: 'zulu' }), candidate({ slug: 'alpha' })],
    context({ limit: 2 }),
  );
  assert.deepEqual(
    ranked.map((item) => item.resource.slug),
    ['alpha', 'zulu'],
  );
});

// --- Diversity caps ---------------------------------------------------------

const suggestion = (slug, mediaType, provider, score) => ({
  resource: { slug, mediaType, provider },
  score,
  gate: { factor: 'age-band-fit', level: 'exact', multiplier: 1 },
  reasons: [],
  diversityCapped: false,
});

test('diversity caps push a third item of one media type below mixed results', () => {
  const capped = applyDiversityCaps(
    [
      suggestion('v1', 'video', 'A', 0.9),
      suggestion('v2', 'video', 'B', 0.85),
      suggestion('v3', 'video', 'C', 0.8),
      suggestion('b1', 'book', 'D', 0.7),
    ],
    4,
    DIVERSITY_CAPS,
  );

  assert.deepEqual(
    capped.map((item) => item.resource.slug),
    ['v1', 'v2', 'b1', 'v3'],
  );
  assert.equal(capped[3].diversityCapped, true);
  assert.equal(capped[0].diversityCapped, false);
});

test('diversity caps also limit a single provider', () => {
  const capped = applyDiversityCaps(
    [
      suggestion('a1', 'video', 'Khan', 0.9),
      suggestion('a2', 'book', 'Khan', 0.88),
      suggestion('a3', 'audio', 'Khan', 0.86),
      suggestion('b1', 'course', 'OpenStax', 0.5),
    ],
    4,
  );

  assert.deepEqual(
    capped.map((item) => item.resource.slug),
    ['a1', 'a2', 'b1', 'a3'],
  );
});

test('diversity caps never drop results, only reorder within the limit', () => {
  const input = [
    suggestion('v1', 'video', 'A', 0.9),
    suggestion('v2', 'video', 'A', 0.8),
    suggestion('v3', 'video', 'A', 0.7),
  ];
  assert.equal(applyDiversityCaps(input, 3).length, 3);
  assert.equal(applyDiversityCaps(input, 2).length, 2);
});

// --- Enrichment provenance --------------------------------------------------

test('a model-derived enrichment row must carry its provenance', () => {
  assert.deepEqual(
    checkEnrichmentProvenance({
      source: 'model',
      safetyVetStatus: 'pending',
    }),
    ['model-row-missing-provenance'],
  );
  assert.deepEqual(
    checkEnrichmentProvenance({
      source: 'model',
      promptVersion: 'enrich/v1',
      model: 'claude-haiku-4-5',
      safetyVetStatus: 'pending',
    }),
    [],
  );
});

test('a curated or deterministic row must not claim model provenance', () => {
  for (const source of ['curated', 'deterministic']) {
    assert.deepEqual(
      checkEnrichmentProvenance({
        source,
        model: 'claude-haiku-4-5',
        safetyVetStatus: 'pending',
      }),
      ['non-model-row-carries-provenance'],
    );
  }
});

test('passing safety vetting requires a named human', () => {
  assert.deepEqual(
    checkEnrichmentProvenance({ source: 'curated', safetyVetStatus: 'passed' }),
    ['passed-vetting-without-human'],
  );
  assert.deepEqual(
    checkEnrichmentProvenance({
      source: 'curated',
      safetyVetStatus: 'passed',
      vettedBy: 'tutor@example.test',
    }),
    [],
  );
});
