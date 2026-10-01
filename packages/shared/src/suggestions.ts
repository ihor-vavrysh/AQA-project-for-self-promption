import { z } from 'zod';
import {
  AGE_BANDS,
  AgeBandSchema,
  ResourceSummarySchema,
  SlugSchema,
} from './catalog.js';
import type {
  AgeBand,
  CostModel,
  LicenceCode,
  MediaType,
  UsageTier,
} from './catalog.js';

/**
 * Deterministic resource suggestions.
 *
 * No model is involved. The ranker reads enrichment fields regardless of whether a
 * curator, a deterministic scorer or (later) a model produced them, so turning on AI
 * enrichment adds rows rather than changing this code. See docs/CATALOG.md §4.2.
 *
 * Scoring is tiered on purpose (docs/adr/0005-suggestion-ranking.md):
 *   hard filters (SQL) → one multiplicative age gate → weighted additive factors.
 * A single weighted sum has no notion of *disqualifying*, so a paid, wrong-age resource
 * with several interest hits would outrank a free, age-exact one.
 *
 * NOTE: there is deliberately no gender field anywhere in this file. PLAN.md §4 forbids
 * gender from influencing selection or ranking, and the strongest enforcement is that it
 * is not representable in the input. `suggestions.test.mjs` asserts this structurally.
 */

// --- Vocabularies -----------------------------------------------------------

/**
 * Closed vocabulary for learner interests and resource themes.
 *
 * Free text here fails silently: "Football" / "football" / "soccer" would overlap with
 * nothing and the resulting list looks plausible while being wrong. A closed set also
 * validates the curation import, sources the picker in the web app, and keeps unvetted
 * free text out of any future model-written explanation.
 */
export const CHARACTER_FIT_TAGS = [
  'animals',
  'art',
  'baking',
  'cars',
  'coding',
  'dance',
  'dinosaurs',
  'fashion',
  'football',
  'gaming',
  'history',
  'music',
  'nature',
  'puzzles',
  'reading',
  'robotics',
  'science-fiction',
  'space',
  'sport',
  'theatre',
] as const;
export const CharacterFitTagSchema = z.enum(CHARACTER_FIT_TAGS);
export type CharacterFitTag = z.infer<typeof CharacterFitTagSchema>;

export const LEARNING_PREFERENCES = [
  'visual',
  'narrative',
  'step-by-step',
  'challenge-first',
] as const;
export const LearningPreferenceSchema = z.enum(LEARNING_PREFERENCES);
export type LearningPreference = z.infer<typeof LearningPreferenceSchema>;

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export const ConfidenceLevelSchema = z.enum(CONFIDENCE_LEVELS);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const ATTENTION_SPANS = ['short', 'medium', 'long'] as const;
export const AttentionSpanSchema = z.enum(ATTENTION_SPANS);
export type AttentionSpan = z.infer<typeof AttentionSpanSchema>;

/** Difficulty expressed relative to the resource's own age band. */
export const DIFFICULTY_BANDS = ['foundation', 'core', 'stretch'] as const;
export const DifficultyBandSchema = z.enum(DIFFICULTY_BANDS);
export type DifficultyBand = z.infer<typeof DifficultyBandSchema>;

export const ENRICHMENT_SOURCES = [
  'curated',
  'deterministic',
  'model',
] as const;
export const EnrichmentSourceSchema = z.enum(ENRICHMENT_SOURCES);
export type EnrichmentSource = z.infer<typeof EnrichmentSourceSchema>;

export const SAFETY_VET_STATUSES = ['pending', 'passed', 'failed'] as const;
export const SafetyVetStatusSchema = z.enum(SAFETY_VET_STATUSES);
export type SafetyVetStatus = z.infer<typeof SafetyVetStatusSchema>;

export const TOPIC_MATCHES = [
  'primary',
  'related',
  'ancestor',
  'none',
] as const;
export const TopicMatchSchema = z.enum(TOPIC_MATCHES);
export type TopicMatch = z.infer<typeof TopicMatchSchema>;

// --- Factors and weights ----------------------------------------------------

/**
 * Every weighted factor. `cost` is the only one whose contribution is never positive.
 * The age-band gate is not in this list: it multiplies the whole sum rather than adding
 * to it, and is reported separately as `gate`.
 */
export const SUGGESTION_FACTORS = [
  'topic-relevance',
  'interest-overlap',
  'reading-level-fit',
  'confidence-fit',
  'media-preference',
  'quality',
  'cost',
] as const;
export const SuggestionFactorSchema = z.enum(SUGGESTION_FACTORS);
export type SuggestionFactor = z.infer<typeof SuggestionFactorSchema>;

/** Factors that can only ever reduce a score. */
export const PENALTY_FACTORS: readonly SuggestionFactor[] = ['cost'];

export type SuggestionWeights = Readonly<Record<SuggestionFactor, number>>;

/**
 * A frozen typed record rather than a JSON file: adding a factor becomes a compile
 * error, which is stronger review than a schema check at boot.
 *
 * Reward weights (every factor but `cost`) sum to 1. `cost` is the maximum penalty
 * magnitude, applied negatively — see `costContribution`.
 */
export const SUGGESTION_WEIGHTS_VERSION = '1.0.0';
export const SUGGESTION_WEIGHTS: SuggestionWeights = Object.freeze({
  'topic-relevance': 0.3,
  'interest-overlap': 0.2,
  'reading-level-fit': 0.2,
  'confidence-fit': 0.1,
  'media-preference': 0.1,
  quality: 0.1,
  cost: 0.15,
});

export const DIVERSITY_CAPS = Object.freeze({
  maxPerMediaType: 2,
  maxPerProvider: 2,
});

/** Reward weights must sum to 1 so scores stay comparable. */
export function rewardWeightTotal(weights: SuggestionWeights): number {
  return SUGGESTION_FACTORS.filter(
    (factor) => !PENALTY_FACTORS.includes(factor),
  ).reduce((total, factor) => total + weights[factor], 0);
}

// --- Reading-level and media targets ---------------------------------------

/** Approximate target Flesch-Kincaid grade level per age band. */
export const AGE_BAND_READING_LEVEL: Readonly<Record<AgeBand, number>> =
  Object.freeze({
    '5-7': 2,
    '8-10': 4,
    '11-13': 6,
    '14-16': 9,
    '17-18': 11,
  });

/**
 * Reading level is meaningless for video and audio, and most such rows carry no score.
 * Treating that as zero would demote exactly the media a visual learner wants, so the
 * factor is skipped and its weight redistributed.
 */
export const TEXTUAL_MEDIA_TYPES: readonly MediaType[] = [
  'book',
  'reference',
  'tutorial',
  'course',
];

export const PREFERRED_MEDIA: Readonly<
  Record<LearningPreference, readonly MediaType[]>
> = Object.freeze({
  visual: ['video', 'reference'],
  narrative: ['audio', 'book'],
  'step-by-step': ['tutorial', 'course'],
  'challenge-first': ['course', 'reference'],
});

/** Interest hits beyond this cap add nothing, so tag-spam cannot dominate. */
export const INTEREST_OVERLAP_CAP = 3;

// --- Input shapes -----------------------------------------------------------

/**
 * The learner profile, supplied per request rather than read from a stored row: no
 * learner tables exist yet. Deliberately coarse and non-identifying — no learner id, no
 * name, no date of birth. And no gender.
 */
export const LearnerContextSchema = z.object({
  node: SlugSchema,
  ageBand: AgeBandSchema,
  locale: z
    .string()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'must be a BCP-47 language tag'),
  interests: z.array(CharacterFitTagSchema).max(8).default([]),
  confidence: ConfidenceLevelSchema.default('medium'),
  learningPreference: LearningPreferenceSchema.default('step-by-step'),
  /**
   * Accepted and persisted in the contract but not yet scored. Named now so the learner
   * roster does not force a rename across the API, the generated client and the database.
   */
  attentionSpan: AttentionSpanSchema.default('medium'),
  allowPaid: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).default(6),
  explain: z.enum(['top', 'full']).default('top'),
});
export type LearnerContext = z.infer<typeof LearnerContextSchema>;

/** The exact key set the scorer may read. Asserted by test; gender is absent. */
export const SCORER_CONTEXT_KEYS = [
  'ageBand',
  'allowPaid',
  'attentionSpan',
  'confidence',
  'interests',
  'learningPreference',
  'locale',
] as const;

export interface SuggestionCandidate {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly mediaType: MediaType;
  readonly provider: string;
  readonly language: string;
  readonly licence: LicenceCode;
  readonly usageTier: UsageTier;
  readonly costModel: CostModel;
  readonly durationSeconds: number | null;
  readonly lastVerifiedAt: string | null;
  readonly pageCount: number | null;
  readonly topicMatch: TopicMatch;
  readonly ageBandFit: readonly AgeBand[];
  readonly readingLevel: number | null;
  readonly difficulty: DifficultyBand | null;
  readonly characterFitTags: readonly CharacterFitTag[];
  readonly qualityScore: number | null;
  readonly enrichmentSource: EnrichmentSource;
}

// --- Output shapes ----------------------------------------------------------

export const SuggestionReasonSchema = z.object({
  factor: SuggestionFactorSchema,
  /** A small ordinal per factor. Tests assert on this, never on `contribution`. */
  level: z.string(),
  contribution: z.number(),
});
export type SuggestionReason = z.infer<typeof SuggestionReasonSchema>;

export const AgeGateSchema = z.object({
  factor: z.literal('age-band-fit'),
  level: z.enum(['exact', 'adjacent', 'distant', 'none']),
  multiplier: z.number(),
});
export type AgeGate = z.infer<typeof AgeGateSchema>;

export const SuggestionSchema = z.object({
  resource: ResourceSummarySchema,
  score: z.number(),
  gate: AgeGateSchema,
  reasons: z.array(SuggestionReasonSchema),
  diversityCapped: z.boolean(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const SUGGESTION_EMPTY_CAUSES = [
  'no-candidates-in-subtree',
  'all-filtered-by-safety-vetting',
  'all-filtered-by-cost',
  'all-filtered-by-language',
  'all-filtered-by-missing-enrichment',
  'all-suppressed-by-age-gate',
] as const;
export const SuggestionEmptyCauseSchema = z.enum(SUGGESTION_EMPTY_CAUSES);
export type SuggestionEmptyCause = z.infer<typeof SuggestionEmptyCauseSchema>;

export const SuggestionListResponseSchema = z.object({
  items: z.array(SuggestionSchema),
  weightsVersion: z.string(),
  candidatesConsidered: z.number().int().min(0),
  /** Present only when `items` is empty, so an empty list is never unexplained. */
  emptyCause: SuggestionEmptyCauseSchema.nullable(),
});
export type SuggestionListResponse = z.infer<
  typeof SuggestionListResponseSchema
>;

// --- Scoring ----------------------------------------------------------------

/** Four decimal places, applied inside the scorer so ties are exact and sortable. */
export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

const ageBandIndex = (band: AgeBand): number => AGE_BANDS.indexOf(band);

/**
 * Age-band fit is the one multiplicative gate. PLAN.md §4 calls it the strongest and most
 * legitimate personalization signal, and making it a gate means no weight configuration
 * can let an interest match rescue a resource aimed at the wrong age.
 */
export function ageGate(
  candidate: Pick<SuggestionCandidate, 'ageBandFit'>,
  ageBand: AgeBand,
): AgeGate {
  if (candidate.ageBandFit.length === 0) {
    return { factor: 'age-band-fit', level: 'none', multiplier: 0 };
  }

  const target = ageBandIndex(ageBand);
  const distance = Math.min(
    ...candidate.ageBandFit.map((band) =>
      Math.abs(ageBandIndex(band) - target),
    ),
  );

  if (distance === 0) {
    return { factor: 'age-band-fit', level: 'exact', multiplier: 1 };
  }
  if (distance === 1) {
    return { factor: 'age-band-fit', level: 'adjacent', multiplier: 0.6 };
  }
  if (distance === 2) {
    return { factor: 'age-band-fit', level: 'distant', multiplier: 0.15 };
  }
  return { factor: 'age-band-fit', level: 'none', multiplier: 0 };
}

const TOPIC_RELEVANCE: Readonly<Record<TopicMatch, number>> = Object.freeze({
  primary: 1,
  related: 0.6,
  ancestor: 0.35,
  none: 0,
});

function interestOverlap(
  candidate: SuggestionCandidate,
  interests: readonly CharacterFitTag[],
): { value: number; level: string } {
  if (interests.length === 0) {
    return { value: 0, level: 'not-requested' };
  }
  const hits = candidate.characterFitTags.filter((tag) =>
    interests.includes(tag),
  ).length;
  const value = Math.min(hits, INTEREST_OVERLAP_CAP) / INTEREST_OVERLAP_CAP;

  if (hits >= INTEREST_OVERLAP_CAP) {
    return { value, level: 'strong' };
  }
  return { value, level: hits > 0 ? 'partial' : 'none' };
}

function readingLevelFit(
  candidate: SuggestionCandidate,
  ageBand: AgeBand,
): { value: number; level: string } | null {
  if (!TEXTUAL_MEDIA_TYPES.includes(candidate.mediaType)) {
    return null;
  }
  if (candidate.readingLevel === null) {
    return null;
  }
  const distance = Math.abs(
    candidate.readingLevel - AGE_BAND_READING_LEVEL[ageBand],
  );
  const value = Math.max(0, 1 - distance / 4);

  if (distance <= 1) {
    return { value, level: 'exact' };
  }
  return { value, level: distance <= 3 ? 'near' : 'far' };
}

/**
 * A hypothesis, not an evidenced rule: low confidence is assumed to favour easier
 * material. Deliberately small-weighted and always visible in `reasons` so it is
 * falsifiable once docs/CATALOG.md §4.3 assignment outcomes exist.
 */
const CONFIDENCE_TARGET: Readonly<Record<ConfidenceLevel, DifficultyBand>> =
  Object.freeze({
    low: 'foundation',
    medium: 'core',
    high: 'stretch',
  });

function confidenceFit(
  candidate: SuggestionCandidate,
  confidence: ConfidenceLevel,
): { value: number; level: string } {
  if (candidate.difficulty === null) {
    return { value: 0.5, level: 'unknown' };
  }
  const order = DIFFICULTY_BANDS.indexOf(candidate.difficulty);
  const target = DIFFICULTY_BANDS.indexOf(CONFIDENCE_TARGET[confidence]);
  const distance = Math.abs(order - target);

  if (distance === 0) {
    return { value: 1, level: 'aligned' };
  }
  return distance === 1
    ? { value: 0.5, level: 'neutral' }
    : { value: 0, level: 'misaligned' };
}

function mediaPreference(
  candidate: SuggestionCandidate,
  preference: LearningPreference,
): { value: number; level: string } {
  return PREFERRED_MEDIA[preference].includes(candidate.mediaType)
    ? { value: 1, level: 'match' }
    : { value: 0.4, level: 'neutral' };
}

function quality(candidate: SuggestionCandidate): {
  value: number;
  level: string;
} {
  if (candidate.qualityScore === null) {
    return { value: 0.5, level: 'unknown' };
  }
  const value = Math.min(1, Math.max(0, candidate.qualityScore));
  return {
    value,
    level: value >= 0.7 ? 'high' : value >= 0.4 ? 'medium' : 'low',
  };
}

/**
 * Cost never helps. docs/CATALOG.md §6 attaches affiliate revenue to the commercial
 * tier, so a weight configuration that rewarded paid material would be a ranker that
 * earns money by recommending worse material to a child's tutor. Enforced structurally:
 * free is zero and every other model is a penalty.
 */
const COST_PENALTY: Readonly<Record<CostModel, number>> = Object.freeze({
  free: 0,
  freemium: 0.4,
  paid: 1,
});

function costContribution(
  candidate: SuggestionCandidate,
  weights: SuggestionWeights,
): SuggestionReason {
  const magnitude = Math.abs(weights.cost) * COST_PENALTY[candidate.costModel];
  return {
    factor: 'cost',
    level: candidate.costModel,
    contribution: round4(-magnitude),
  };
}

export interface ScoredCandidate {
  readonly score: number;
  readonly gate: AgeGate;
  readonly reasons: SuggestionReason[];
}

/**
 * Pure. No database, no clock, no randomness — the same inputs always produce the same
 * output, which is what makes the suggestion list testable and the explanations true.
 */
export function scoreResource(
  candidate: SuggestionCandidate,
  context: Pick<
    LearnerContext,
    'ageBand' | 'confidence' | 'interests' | 'learningPreference'
  >,
  weights: SuggestionWeights = SUGGESTION_WEIGHTS,
): ScoredCandidate {
  const gate = ageGate(candidate, context.ageBand);

  const reading = readingLevelFit(candidate, context.ageBand);
  const rewards: { factor: SuggestionFactor; value: number; level: string }[] =
    [
      {
        factor: 'topic-relevance',
        value: TOPIC_RELEVANCE[candidate.topicMatch],
        level: candidate.topicMatch,
      },
      {
        factor: 'interest-overlap',
        ...interestOverlap(candidate, context.interests),
      },
      {
        factor: 'confidence-fit',
        ...confidenceFit(candidate, context.confidence),
      },
      {
        factor: 'media-preference',
        ...mediaPreference(candidate, context.learningPreference),
      },
      { factor: 'quality', ...quality(candidate) },
    ];

  if (reading) {
    rewards.push({ factor: 'reading-level-fit', ...reading });
  }

  // Redistribute the weight of any skipped reward factor so scores stay comparable
  // across media types rather than silently penalising video and audio.
  const activeWeight = rewards.reduce(
    (total, reward) => total + weights[reward.factor],
    0,
  );
  const scale =
    activeWeight > 0 ? rewardWeightTotal(weights) / activeWeight : 0;

  const reasons: SuggestionReason[] = rewards.map((reward) => ({
    factor: reward.factor,
    level: reward.level,
    contribution: round4(reward.value * weights[reward.factor] * scale),
  }));

  if (!reading) {
    reasons.push({
      factor: 'reading-level-fit',
      level: 'not-applicable',
      contribution: 0,
    });
  }

  reasons.push(costContribution(candidate, weights));

  const subtotal = reasons.reduce(
    (total, reason) => total + reason.contribution,
    0,
  );
  const score = round4(Math.min(1, Math.max(0, subtotal * gate.multiplier)));

  reasons.sort(
    (a, b) =>
      Math.abs(b.contribution) - Math.abs(a.contribution) ||
      a.factor.localeCompare(b.factor),
  );

  return { score, gate, reasons };
}

/**
 * Per-key caps rather than a similarity-based re-rank: with no embeddings, an MMR
 * diversity term would reduce to this anyway, with a tunable nobody can reason about and
 * a result where item four's position depends on items one to three.
 *
 * One stable pass over the score-ordered list, then backfill from what was pushed down.
 */
export function applyDiversityCaps(
  scored: readonly (Suggestion & { diversityCapped: boolean })[],
  limit: number,
  caps = DIVERSITY_CAPS,
): Suggestion[] {
  const accepted: Suggestion[] = [];
  const deferred: Suggestion[] = [];
  const byMediaType = new Map<string, number>();
  const byProvider = new Map<string, number>();

  for (const item of scored) {
    const mediaCount = byMediaType.get(item.resource.mediaType) ?? 0;
    const providerCount = byProvider.get(item.resource.provider) ?? 0;

    if (
      accepted.length < limit &&
      mediaCount < caps.maxPerMediaType &&
      providerCount < caps.maxPerProvider
    ) {
      accepted.push({ ...item, diversityCapped: false });
      byMediaType.set(item.resource.mediaType, mediaCount + 1);
      byProvider.set(item.resource.provider, providerCount + 1);
    } else {
      deferred.push({ ...item, diversityCapped: true });
    }
  }

  for (const item of deferred) {
    if (accepted.length >= limit) {
      break;
    }
    accepted.push(item);
  }

  return accepted;
}

/**
 * Scores, orders and caps. The tie-break is total — score then slug — because without
 * one the output would depend on database row order and the bias-parity test would flake.
 */
export function rankSuggestions(
  candidates: readonly SuggestionCandidate[],
  context: LearnerContext,
  weights: SuggestionWeights = SUGGESTION_WEIGHTS,
  caps = DIVERSITY_CAPS,
): Suggestion[] {
  const scored = candidates
    .map((candidate) => {
      const { score, gate, reasons } = scoreResource(
        candidate,
        context,
        weights,
      );
      return {
        resource: {
          id: candidate.id,
          slug: candidate.slug,
          title: candidate.title,
          description: candidate.description,
          mediaType: candidate.mediaType,
          provider: candidate.provider,
          language: candidate.language,
          licence: candidate.licence,
          usageTier: candidate.usageTier,
          costModel: candidate.costModel,
          durationSeconds: candidate.durationSeconds,
          pageCount: candidate.pageCount,
          lastVerifiedAt: candidate.lastVerifiedAt,
        },
        score,
        gate,
        reasons:
          context.explain === 'full'
            ? reasons
            : reasons.filter((reason) => reason.contribution !== 0),
        diversityCapped: false,
      };
    })
    .filter((item) => item.gate.multiplier > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.resource.slug.localeCompare(b.resource.slug),
    );

  return applyDiversityCaps(scored, context.limit, caps);
}

// --- Enrichment provenance --------------------------------------------------

export const ENRICHMENT_PROVENANCE_VIOLATIONS = [
  'model-row-missing-provenance',
  'non-model-row-carries-provenance',
  'passed-vetting-without-human',
] as const;
export type EnrichmentProvenanceViolation =
  (typeof ENRICHMENT_PROVENANCE_VIOLATIONS)[number];

export interface EnrichmentProvenanceSubject {
  readonly source: EnrichmentSource;
  readonly promptVersion?: string | null | undefined;
  readonly model?: string | null | undefined;
  readonly safetyVetStatus: SafetyVetStatus;
  readonly vettedBy?: string | null | undefined;
}

const filled = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Mirrors the CHECK constraints on `resource_enrichment`, the same way
 * `checkUsageRights` mirrors the constraints on `resources`. A curated row must not
 * self-certify safety vetting: docs/CATALOG.md §4.1 requires a human.
 */
export function checkEnrichmentProvenance(
  subject: EnrichmentProvenanceSubject,
): EnrichmentProvenanceViolation[] {
  const violations: EnrichmentProvenanceViolation[] = [];
  const hasProvenance = filled(subject.promptVersion) && filled(subject.model);

  if (subject.source === 'model' && !hasProvenance) {
    violations.push('model-row-missing-provenance');
  }
  if (
    subject.source !== 'model' &&
    (filled(subject.promptVersion) || filled(subject.model))
  ) {
    violations.push('non-model-row-carries-provenance');
  }
  if (subject.safetyVetStatus === 'passed' && !filled(subject.vettedBy)) {
    violations.push('passed-vetting-without-human');
  }

  return violations;
}
