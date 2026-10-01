import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  boolean,
  numeric,
  pgView,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  COST_MODELS,
  DIFFICULTY_BANDS,
  ENRICHMENT_SOURCES,
  LICENCE_CODES,
  MEDIA_TYPES,
  SAFETY_VET_STATUSES,
  TAXONOMY_SCHEMES,
  USAGE_TIERS,
} from '@tutorforge/shared';

export const organisationRole = pgEnum('organisation_role', ['admin', 'tutor']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  auth0Subject: varchar('auth0_subject', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 320 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const organisations = pgTable('organisations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 160 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export const organisationMemberships = pgTable(
  'organisation_memberships',
  {
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: organisationRole('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.organisationId, table.userId] })],
);

// --- Content catalog (docs/CATALOG.md) --------------------------------------

export const taxonomyScheme = pgEnum('taxonomy_scheme', TAXONOMY_SCHEMES);
export const mediaType = pgEnum('media_type', MEDIA_TYPES);
export const licenceCode = pgEnum('licence_code', LICENCE_CODES);
export const usageTier = pgEnum('usage_tier', USAGE_TIERS);
export const costModel = pgEnum('cost_model', COST_MODELS);

/**
 * `path` is a materialised dot-separated path of node codes, so a subtree is a
 * prefix scan. PLAN.md §15 decision 8 leans towards `ltree`; this keeps the
 * same query shape without depending on a Postgres extension yet, and the
 * migration to `ltree` stays local to this column and its index.
 */
export const taxonomyNodes = pgTable(
  'taxonomy_nodes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentId: uuid('parent_id').references(
      (): AnyPgColumn => taxonomyNodes.id,
      {
        onDelete: 'restrict',
      },
    ),
    scheme: taxonomyScheme('scheme').notNull(),
    // 64, not 32: wedge topic codes such as
    // `ks4-biology-inheritance-variation-evolution` are 43 characters.
    code: varchar('code', { length: 64 }).notNull(),
    slug: varchar('slug', { length: 160 }).notNull(),
    path: text('path').notNull(),
    depth: integer('depth').notNull(),
    names: jsonb('names').$type<Record<string, string>>().notNull(),
    /** Denormalised depth-gate counters, recomputed when resources change. */
    resourceCount: integer('resource_count').default(0).notNull(),
    mediaTypeCount: integer('media_type_count').default(0).notNull(),
    publishedAt: timestamp('published_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('taxonomy_nodes_slug_key').on(table.slug),
    uniqueIndex('taxonomy_nodes_scheme_code_key').on(table.scheme, table.code),
    index('taxonomy_nodes_path_idx').on(table.path),
    index('taxonomy_nodes_parent_idx').on(table.parentId),
    check('taxonomy_nodes_depth_non_negative', sql`${table.depth} >= 0`),
    check(
      'taxonomy_nodes_counts_non_negative',
      sql`${table.resourceCount} >= 0 and ${table.mediaTypeCount} >= 0`,
    ),
  ],
);

/**
 * Third-party material. `licence` and `usage_tier` are mandatory and the CHECK
 * constraints below mirror `checkUsageRights` in @tutorforge/shared, so the
 * database refuses a row the application layer would reject. docs/CATALOG.md §3
 * explains why these are the highest-value constraints in the schema.
 */
export const resources = pgTable(
  'resources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 160 }).notNull(),
    title: varchar('title', { length: 300 }).notNull(),
    description: text('description'),
    canonicalUrl: text('canonical_url').notNull(),
    embedUrl: text('embed_url'),
    mirroredPath: text('mirrored_path'),
    affiliateUrl: text('affiliate_url'),
    mediaType: mediaType('media_type').notNull(),
    provider: varchar('provider', { length: 160 }).notNull(),
    authors: jsonb('authors').$type<string[]>().default([]).notNull(),
    language: varchar('language', { length: 8 }).notNull(),
    licence: licenceCode('licence').notNull(),
    usageTier: usageTier('usage_tier').notNull(),
    attributionText: varchar('attribution_text', { length: 500 }),
    costModel: costModel('cost_model').notNull(),
    isbn: varchar('isbn', { length: 13 }),
    durationSeconds: integer('duration_seconds'),
    pageCount: integer('page_count'),
    sourceConnector: varchar('source_connector', { length: 64 }).notNull(),
    sourceTermsVerifiedAt: timestamp('source_terms_verified_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    lastVerifiedAt: timestamp('last_verified_at', {
      withTimezone: true,
      mode: 'date',
    }),
    publishedAt: timestamp('published_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('resources_slug_key').on(table.slug),
    index('resources_media_type_idx').on(table.mediaType),
    index('resources_published_at_idx').on(table.publishedAt),
    index('resources_language_idx').on(table.language),
    index('resources_cost_model_idx').on(table.costModel),
    // Each licence permits exactly one usage tier.
    check(
      'resources_licence_matches_usage_tier',
      sql`(
        (${table.licence} in ('cc0', 'public-domain', 'cc-by', 'cc-by-sa') and ${table.usageTier} = 'open')
        or (${table.licence} = 'platform-tos' and ${table.usageTier} = 'embed')
        or (${table.licence} = 'proprietary' and ${table.usageTier} = 'commercial')
      )`,
    ),
    // Commercial material is metadata plus an outbound link. Never embedded, never stored.
    check(
      'resources_commercial_links_only',
      sql`${table.usageTier} <> 'commercial' or (${table.embedUrl} is null and ${table.mirroredPath} is null)`,
    ),
    // Embed-permitted material must carry an embed URL and must never be stored.
    check(
      'resources_embed_tier_requires_embed_url',
      sql`${table.usageTier} <> 'embed' or (${table.embedUrl} is not null and ${table.mirroredPath} is null)`,
    ),
    // Only the commercial tier may carry an affiliate link.
    check(
      'resources_affiliate_commercial_only',
      sql`${table.affiliateUrl} is null or ${table.usageTier} = 'commercial'`,
    ),
    // Attribution-requiring licences must carry attribution text.
    check(
      'resources_attribution_present_when_required',
      sql`${table.licence} not in ('cc-by', 'cc-by-sa')
        or (${table.attributionText} is not null and btrim(${table.attributionText}) <> '')`,
    ),
  ],
);

export const resourceTaxonomy = pgTable(
  'resource_taxonomy',
  {
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => taxonomyNodes.id, { onDelete: 'cascade' }),
    primary: boolean('primary').default(false).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.resourceId, table.nodeId] }),
    index('resource_taxonomy_node_idx').on(table.nodeId),
  ],
);

// --- Suggestion enrichment (docs/CATALOG.md §4.1, docs/adr/0005) -------------

export const enrichmentSource = pgEnum('enrichment_source', ENRICHMENT_SOURCES);
export const difficultyBand = pgEnum('difficulty_band', DIFFICULTY_BANDS);
export const safetyVetStatus = pgEnum('safety_vet_status', SAFETY_VET_STATUSES);

/**
 * Personalization signals for a resource, keyed by who produced them.
 *
 * Several rows per resource is the point: it is the only way to measure a model against
 * the curator who labelled the same resource by hand. Precedence is resolved by the
 * `resource_enrichment_current` view, and production queries read the view — joining this
 * table without a `source` predicate fans out and double-counts a resource.
 *
 * The CHECK constraints mirror `checkEnrichmentProvenance` in @tutorforge/shared, the same
 * way the `resources` constraints mirror `checkUsageRights`.
 */
export const resourceEnrichment = pgTable(
  'resource_enrichment',
  {
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    source: enrichmentSource('source').notNull(),
    ageBandFit: text('age_band_fit').array().notNull().default([]),
    readingLevel: integer('reading_level'),
    readabilityScore: numeric('readability_score', { precision: 5, scale: 2 }),
    difficulty: difficultyBand('difficulty'),
    prerequisiteConcepts: text('prerequisite_concepts')
      .array()
      .notNull()
      .default([]),
    characterFitTags: text('character_fit_tags').array().notNull().default([]),
    qualityScore: numeric('quality_score', { precision: 3, scale: 2 }),
    summary: text('summary'),
    safetyVetStatus: safetyVetStatus('safety_vet_status')
      .default('pending')
      .notNull(),
    vettedBy: varchar('vetted_by', { length: 320 }),
    vettedAt: timestamp('vetted_at', { withTimezone: true, mode: 'date' }),
    promptVersion: varchar('prompt_version', { length: 64 }),
    model: varchar('model', { length: 64 }),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
    enrichedAt: timestamp('enriched_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.resourceId, table.source] }),
    index('resource_enrichment_age_band_idx').using('gin', table.ageBandFit),
    index('resource_enrichment_tags_idx').using('gin', table.characterFitTags),
    index('resource_enrichment_vet_idx').on(table.safetyVetStatus),
    // A model-derived row must say which prompt and model produced it.
    check(
      'resource_enrichment_model_provenance',
      sql`${table.source} <> 'model' or (${table.promptVersion} is not null and ${table.model} is not null)`,
    ),
    // A curated or deterministic row must not claim model provenance.
    check(
      'resource_enrichment_non_model_provenance',
      sql`${table.source} = 'model' or (${table.promptVersion} is null and ${table.model} is null)`,
    ),
    // docs/CATALOG.md §4.1: nothing is surfaceable to a minor on a machine's word alone.
    check(
      'resource_enrichment_vetting_needs_human',
      sql`${table.safetyVetStatus} <> 'passed'
        or (${table.vettedBy} is not null and btrim(${table.vettedBy}) <> '')`,
    ),
    check(
      'resource_enrichment_quality_range',
      sql`${table.qualityScore} is null or (${table.qualityScore} >= 0 and ${table.qualityScore} <= 1)`,
    ),
    check(
      'resource_enrichment_tag_cap',
      sql`cardinality(${table.characterFitTags}) <= 8`,
    ),
  ],
);

/**
 * One enrichment row per resource, preferring a human curator over a deterministic
 * scorer over a model.
 *
 * Whole-row precedence, never per-column: coalescing columns across sources produces a
 * record nobody reviewed, with a difficulty from one source and an age band from another,
 * and renders the provenance columns meaningless.
 *
 * Declared as `.existing()` — the migration owns the SQL, because `DISTINCT ON` does not
 * round-trip through the schema generator.
 */
export const resourceEnrichmentCurrent = pgView('resource_enrichment_current', {
  resourceId: uuid('resource_id').notNull(),
  source: enrichmentSource('source').notNull(),
  ageBandFit: text('age_band_fit').array().notNull(),
  readingLevel: integer('reading_level'),
  difficulty: difficultyBand('difficulty'),
  characterFitTags: text('character_fit_tags').array().notNull(),
  qualityScore: numeric('quality_score', { precision: 3, scale: 2 }),
  summary: text('summary'),
  safetyVetStatus: safetyVetStatus('safety_vet_status').notNull(),
}).existing();
