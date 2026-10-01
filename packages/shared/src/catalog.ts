import { z } from 'zod';

/**
 * Catalog domain contracts.
 *
 * The usage-rights rules in this file are the single source of truth for what the
 * product may do with a third-party resource. They are enforced in three places:
 * this schema (API and connector input), matching database CHECK constraints
 * (`apps/api/src/database/schema.ts`), and an audit over every stored row
 * (`checkUsageRights`, used by the blocking invariant test). See docs/CATALOG.md §3.
 *
 * TutorForge never hosts third-party content. A resource is deep-linked, embedded
 * through the provider's official player, or — for open licences only — mirrored.
 */

// --- Enumerations -----------------------------------------------------------

export const USAGE_TIERS = ['open', 'embed', 'commercial'] as const;
export const UsageTierSchema = z.enum(USAGE_TIERS);
export type UsageTier = z.infer<typeof UsageTierSchema>;

export const LICENCE_CODES = [
  'cc0',
  'public-domain',
  'cc-by',
  'cc-by-sa',
  'platform-tos',
  'proprietary',
] as const;
export const LicenceCodeSchema = z.enum(LICENCE_CODES);
export type LicenceCode = z.infer<typeof LicenceCodeSchema>;

export const MEDIA_TYPES = [
  'course',
  'tutorial',
  'book',
  'reference',
  'audio',
  'video',
] as const;
export const MediaTypeSchema = z.enum(MEDIA_TYPES);
export type MediaType = z.infer<typeof MediaTypeSchema>;

/** Matches the learner age bands in PLAN.md §4. */
export const AGE_BANDS = ['5-7', '8-10', '11-13', '14-16', '17-18'] as const;
export const AgeBandSchema = z.enum(AGE_BANDS);
export type AgeBand = z.infer<typeof AgeBandSchema>;

export const TAXONOMY_SCHEMES = [
  'isced-f',
  'uk-nc',
  'sced',
  'internal',
] as const;
export const TaxonomySchemeSchema = z.enum(TAXONOMY_SCHEMES);
export type TaxonomyScheme = z.infer<typeof TaxonomySchemeSchema>;

export const COST_MODELS = ['free', 'freemium', 'paid'] as const;
export const CostModelSchema = z.enum(COST_MODELS);
export type CostModel = z.infer<typeof CostModelSchema>;

// --- Rights model -----------------------------------------------------------

/**
 * Each licence permits exactly one usage tier, which makes the pairing checkable
 * rather than a matter of reviewer judgement.
 */
export const LICENCE_USAGE_TIER: Readonly<Record<LicenceCode, UsageTier>> = {
  cc0: 'open',
  'public-domain': 'open',
  'cc-by': 'open',
  'cc-by-sa': 'open',
  'platform-tos': 'embed',
  proprietary: 'commercial',
};

export const LICENCES_REQUIRING_ATTRIBUTION: readonly LicenceCode[] = [
  'cc-by',
  'cc-by-sa',
];

export interface TierCapabilities {
  /** Link out to the provider's own page. Always allowed. */
  readonly deepLink: boolean;
  /** Render the provider's official embed/player in our page. */
  readonly embed: boolean;
  /** Store a copy of the content itself. Open licences only. */
  readonly mirror: boolean;
  /** Decorate the outbound link with an affiliate parameter. */
  readonly affiliate: boolean;
}

export const TIER_CAPABILITIES: Readonly<Record<UsageTier, TierCapabilities>> =
  {
    open: { deepLink: true, embed: true, mirror: true, affiliate: false },
    embed: { deepLink: true, embed: true, mirror: false, affiliate: false },
    commercial: {
      deepLink: true,
      embed: false,
      mirror: false,
      affiliate: true,
    },
  };

export const USAGE_RIGHTS_VIOLATIONS = [
  'licence-tier-mismatch',
  'commercial-must-not-embed',
  'commercial-must-not-mirror',
  'embed-requires-embed-url',
  'embed-must-not-mirror',
  'non-commercial-must-not-affiliate',
  'missing-attribution',
] as const;
export type UsageRightsViolation = (typeof USAGE_RIGHTS_VIOLATIONS)[number];

/** The subset of a resource the rights rules depend on. */
export interface UsageRightsSubject {
  readonly licence: LicenceCode;
  readonly usageTier: UsageTier;
  readonly embedUrl?: string | null | undefined;
  readonly mirroredPath?: string | null | undefined;
  readonly affiliateUrl?: string | null | undefined;
  readonly attributionText?: string | null | undefined;
}

const present = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Returns every usage-rights rule the subject breaks. An empty array means the
 * resource is safe to publish.
 *
 * Pure and dependency-free on purpose: the API, the connector pipeline and the
 * database audit all call this, so there is exactly one definition of the rules.
 */
export function checkUsageRights(
  subject: UsageRightsSubject,
): UsageRightsViolation[] {
  const violations: UsageRightsViolation[] = [];
  const { licence, usageTier } = subject;

  if (LICENCE_USAGE_TIER[licence] !== usageTier) {
    violations.push('licence-tier-mismatch');
  }

  const capabilities = TIER_CAPABILITIES[usageTier];

  if (present(subject.embedUrl) && !capabilities.embed) {
    violations.push('commercial-must-not-embed');
  }
  if (present(subject.mirroredPath) && !capabilities.mirror) {
    violations.push(
      usageTier === 'commercial'
        ? 'commercial-must-not-mirror'
        : 'embed-must-not-mirror',
    );
  }
  if (usageTier === 'embed' && !present(subject.embedUrl)) {
    violations.push('embed-requires-embed-url');
  }
  if (present(subject.affiliateUrl) && !capabilities.affiliate) {
    violations.push('non-commercial-must-not-affiliate');
  }
  if (
    LICENCES_REQUIRING_ATTRIBUTION.includes(licence) &&
    !present(subject.attributionText)
  ) {
    violations.push('missing-attribution');
  }

  return violations;
}

export function assertUsageRights(subject: UsageRightsSubject): void {
  const violations = checkUsageRights(subject);
  if (violations.length > 0) {
    throw new Error(`Usage-rights violations: ${violations.join(', ')}`);
  }
}

// --- Depth gate (docs/CATALOG.md §1.2) --------------------------------------

/**
 * A taxonomy node stays unpublished — navigable, but not indexed and not
 * presented as covered — until it carries enough breadth to be worth a page.
 */
export const DEPTH_GATE = { minResources: 12, minMediaTypes: 3 } as const;

export interface NodeDepth {
  readonly resourceCount: number;
  readonly mediaTypeCount: number;
}

export function isNodePublishable(depth: NodeDepth): boolean {
  return (
    depth.resourceCount >= DEPTH_GATE.minResources &&
    depth.mediaTypeCount >= DEPTH_GATE.minMediaTypes
  );
}

// --- Schemas ----------------------------------------------------------------

const SlugSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase hyphenated slug');

export const LocalisedNamesSchema = z
  .record(z.string(), z.string())
  .refine(
    (names) => typeof names.en === 'string' && names.en.trim().length > 0,
    { message: 'an English label is required' },
  );

export const TaxonomyNodeSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  scheme: TaxonomySchemeSchema,
  code: z.string().min(1).max(32),
  slug: SlugSchema,
  path: z.string().min(1),
  depth: z.number().int().min(0),
  names: LocalisedNamesSchema,
  resourceCount: z.number().int().min(0),
  mediaTypeCount: z.number().int().min(0),
  published: z.boolean(),
});
export type TaxonomyNode = z.infer<typeof TaxonomyNodeSchema>;

export const TaxonomyTreeNodeSchema: z.ZodType<TaxonomyTreeNode> = z.lazy(() =>
  TaxonomyNodeSchema.extend({
    children: z.array(TaxonomyTreeNodeSchema),
  }),
);
export type TaxonomyTreeNode = TaxonomyNode & {
  children: TaxonomyTreeNode[];
};

/** Fields a connector or CSV import supplies. Rights rules apply here. */
export const ResourceInputSchema = z
  .object({
    slug: SlugSchema,
    title: z.string().min(1).max(300),
    description: z.string().max(2000).nullable().optional(),
    canonicalUrl: z.url(),
    embedUrl: z.url().nullable().optional(),
    mirroredPath: z.string().min(1).nullable().optional(),
    affiliateUrl: z.url().nullable().optional(),
    mediaType: MediaTypeSchema,
    provider: z.string().min(1).max(160),
    authors: z.array(z.string().min(1)).default([]),
    language: z
      .string()
      .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'must be a BCP-47 language tag'),
    licence: LicenceCodeSchema,
    usageTier: UsageTierSchema,
    attributionText: z.string().max(500).nullable().optional(),
    costModel: CostModelSchema,
    isbn: z
      .string()
      .regex(/^(?:\d{9}[\dXx]|\d{13})$/, 'must be an ISBN-10 or ISBN-13')
      .nullable()
      .optional(),
    durationSeconds: z.number().int().positive().nullable().optional(),
    pageCount: z.number().int().positive().nullable().optional(),
    sourceConnector: z.string().min(1).max(64),
    sourceTermsVerifiedAt: z.iso.datetime(),
  })
  .superRefine((value, ctx) => {
    for (const violation of checkUsageRights(value)) {
      ctx.addIssue({
        code: 'custom',
        message: `usage-rights violation: ${violation}`,
        params: { violation },
      });
    }
  });
export type ResourceInput = z.infer<typeof ResourceInputSchema>;

export const ResourceSummarySchema = z.object({
  id: z.uuid(),
  slug: SlugSchema,
  title: z.string(),
  description: z.string().nullable(),
  mediaType: MediaTypeSchema,
  provider: z.string(),
  language: z.string(),
  licence: LicenceCodeSchema,
  usageTier: UsageTierSchema,
  costModel: CostModelSchema,
  durationSeconds: z.number().int().nullable(),
  pageCount: z.number().int().nullable(),
  lastVerifiedAt: z.iso.datetime().nullable(),
});
export type ResourceSummary = z.infer<typeof ResourceSummarySchema>;

export const ResourceDetailSchema = ResourceSummarySchema.extend({
  canonicalUrl: z.url(),
  /** Present only for tiers whose capabilities permit embedding. */
  embedUrl: z.url().nullable(),
  /** Present only for the commercial tier. */
  outboundUrl: z.url(),
  attributionText: z.string().nullable(),
  authors: z.array(z.string()),
  isbn: z.string().nullable(),
  capabilities: z.object({
    deepLink: z.boolean(),
    embed: z.boolean(),
    mirror: z.boolean(),
    affiliate: z.boolean(),
  }),
});
export type ResourceDetail = z.infer<typeof ResourceDetailSchema>;

export const ResourceListQuerySchema = z.object({
  node: SlugSchema.optional(),
  mediaType: MediaTypeSchema.optional(),
  language: z.string().optional(),
  costModel: CostModelSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ResourceListQuery = z.infer<typeof ResourceListQuerySchema>;

export const ResourceListResponseSchema = z.object({
  items: z.array(ResourceSummarySchema),
  total: z.number().int().min(0),
  facets: z.object({
    mediaType: z.record(z.string(), z.number().int()),
    costModel: z.record(z.string(), z.number().int()),
  }),
});
export type ResourceListResponse = z.infer<typeof ResourceListResponseSchema>;

/**
 * The outbound URL a tutor or visitor should follow: the affiliate link when the
 * tier permits one, the canonical provider URL otherwise.
 */
export function resolveOutboundUrl(resource: {
  usageTier: UsageTier;
  canonicalUrl: string;
  affiliateUrl?: string | null | undefined;
}): string {
  if (
    TIER_CAPABILITIES[resource.usageTier].affiliate &&
    present(resource.affiliateUrl)
  ) {
    return resource.affiliateUrl as string;
  }
  return resource.canonicalUrl;
}

// --- Tree assembly (pure, so it is unit-testable without a database) --------

/** Assembles a flat node list into a forest, preserving input order. */
export function buildTaxonomyTree(
  nodes: readonly TaxonomyNode[],
): TaxonomyTreeNode[] {
  const byId = new Map<string, TaxonomyTreeNode>(
    nodes.map((node) => [node.id, { ...node, children: [] }]),
  );
  const roots: TaxonomyTreeNode[] = [];

  for (const node of nodes) {
    const entry = byId.get(node.id);
    if (!entry) {
      continue;
    }
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) {
      parent.children.push(entry);
    } else {
      roots.push(entry);
    }
  }

  return roots;
}

/**
 * Keeps published nodes plus the ancestors needed to reach them, so a published
 * topic is never orphaned from the navigation tree while its unpublished
 * siblings stay hidden.
 */
export function retainPublishedWithAncestors(
  nodes: readonly TaxonomyNode[],
): TaxonomyNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const keep = new Set<string>();

  for (const node of nodes) {
    if (!node.published) {
      continue;
    }
    let cursor: TaxonomyNode | undefined = node;
    while (cursor && !keep.has(cursor.id)) {
      keep.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
  }

  return nodes.filter((node) => keep.has(node.id));
}
