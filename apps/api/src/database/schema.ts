import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  boolean,
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
  LICENCE_CODES,
  MEDIA_TYPES,
  TAXONOMY_SCHEMES,
  USAGE_TIERS,
} from '@tutorforge/shared';

export const organisationRole = pgEnum('organisation_role', ['admin', 'tutor']);
export const learnerAgeBand = pgEnum('learner_age_band', [
  '5-7',
  '8-10',
  '11-13',
  '14-16',
  '17-18',
]);
export const learnerLearningPreference = pgEnum('learner_learning_preference', [
  'visual',
  'narrative',
  'step-by-step',
  'challenge-first',
]);
export const learnerConfidenceLevel = pgEnum('learner_confidence_level', [
  'low',
  'developing',
  'confident',
  'high',
]);
export const learnerAttentionSpan = pgEnum('learner_attention_span', [
  'under-10-minutes',
  '10-20-minutes',
  'over-20-minutes',
]);

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

export const learners = pgTable('learners', {
  id: uuid('id').defaultRandom().primaryKey(),
  tutorId: uuid('tutor_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  pseudonym: varchar('pseudonym', { length: 40 }).notNull(),
  ageBand: learnerAgeBand('age_band').notNull(),
  locale: varchar('locale', { length: 20 }).notNull(),
  curriculumCode: varchar('curriculum_code', { length: 40 }).notNull(),
  interests: varchar('interests', { length: 40 }).array().notNull().default([]),
  learningPreference: learnerLearningPreference(
    'learning_preference',
  ).notNull(),
  confidenceLevel: learnerConfidenceLevel('confidence_level').notNull(),
  attentionSpan: learnerAttentionSpan('attention_span').notNull(),
  gender: varchar('gender', { length: 64 }),
  subject: varchar('subject', { length: 80 }).notNull(),
  level: varchar('level', { length: 80 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

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
    code: varchar('code', { length: 160 }).notNull(),
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

export const topicDemand = pgTable(
  'topic_demand',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => taxonomyNodes.id, { onDelete: 'cascade' }),
    requestedBy: varchar('requested_by', { length: 160 }).notNull(),
    requestedAt: timestamp('requested_at', {
      withTimezone: true,
      mode: 'date',
    })
      .defaultNow()
      .notNull(),
    count: integer('count').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('topic_demand_node_requested_by_key').on(
      table.nodeId,
      table.requestedBy,
    ),
    index('topic_demand_node_idx').on(table.nodeId),
    check('topic_demand_count_positive', sql`${table.count} > 0`),
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
