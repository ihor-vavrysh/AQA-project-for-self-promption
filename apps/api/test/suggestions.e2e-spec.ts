import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { resolve } from 'node:path';
import { DatabaseService } from '../src/database/database.service.js';
import { SuggestionsService } from '../src/catalog/suggestions.service.js';
import { seedTaxonomy } from '../src/catalog/taxonomy-seed.js';
import { seedDemoCatalog } from '../src/catalog/demo-seed.js';
import {
  resourceEnrichment,
  resourceTaxonomy,
  resources,
  taxonomyNodes,
} from '../src/database/schema.js';

const NODE = 'ks4-maths-algebra';

/** A 14–16 learner, which is what the demo wedge is curated for. */
const learner = (overrides: Record<string, unknown> = {}) => ({
  node: NODE,
  ageBand: '14-16',
  locale: 'en-GB',
  ...overrides,
});

describe('Suggestions integration (PostgreSQL)', () => {
  let app!: INestApplication<App>;
  let postgres: StartedPostgreSqlContainer | undefined;
  let database!: DatabaseService;
  let suggestions!: SuggestionsService;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:16-alpine').start();
    process.env.DATABASE_URL = postgres.getConnectionUri();
    process.env.AUTH0_DOMAIN = 'tenant.example.test';
    process.env.AUTH0_AUDIENCE = 'https://api.tutorforge.test';

    const { AppModule } = await import('../src/app.module.js');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    database = app.get(DatabaseService);
    suggestions = app.get(SuggestionsService);

    await migrate(database.db, {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });
    await seedTaxonomy(database.db);
    await seedDemoCatalog(database.db);
  });

  const post = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/catalog/suggestions').send(body);

  describe('the happy path', () => {
    it('returns ranked suggestions with reasons and a weights version', async () => {
      const response = await post(learner()).expect(200);

      expect(response.body.items.length).toBeGreaterThan(0);
      expect(response.body.emptyCause).toBeNull();
      expect(response.body.weightsVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(response.body.candidatesConsidered).toBeGreaterThan(0);

      for (const item of response.body.items) {
        expect(item.reasons.length).toBeGreaterThan(0);
        expect(item.gate.factor).toBe('age-band-fit');
        expect(item.score).toBeGreaterThan(0);
      }
    });

    it('is served without authentication and is never cached', async () => {
      const response = await post(learner()).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
    });

    it('orders results deterministically for a fixed profile', async () => {
      const first = await post(learner({ interests: ['football'] })).expect(
        200,
      );
      const second = await post(learner({ interests: ['football'] })).expect(
        200,
      );
      expect(JSON.stringify(first.body)).toBe(JSON.stringify(second.body));
    });

    it('moves an interest-matching resource up the list', async () => {
      const neutral = await post(learner({ limit: 6 })).expect(200);
      const football = await post(
        learner({ interests: ['football'], limit: 6 }),
      ).expect(200);

      const rank = (body: { items: { resource: { slug: string } }[] }) =>
        body.items.findIndex(
          (item) => item.resource.slug === 'demo-algebra-football-stats-video',
        );

      expect(rank(football.body)).toBeGreaterThanOrEqual(0);
      expect(rank(football.body)).toBeLessThan(
        rank(neutral.body) === -1
          ? Number.MAX_SAFE_INTEGER
          : rank(neutral.body),
      );
    });

    it('404s for an unknown taxonomy node rather than returning an empty list', async () => {
      await post(learner({ node: 'not-a-real-node' })).expect(404);
    });

    it('rejects an interest outside the closed vocabulary', async () => {
      await post(learner({ interests: ['Football'] })).expect(400);
    });
  });

  describe('gender cannot influence ranking', () => {
    it('returns an identical body whether or not a gender is supplied', async () => {
      const absent = await post(learner({ interests: ['football'] })).expect(
        200,
      );
      const female = await post(
        learner({ interests: ['football'], gender: 'female' }),
      ).expect(200);
      const male = await post(
        learner({ interests: ['football'], gender: 'male' }),
      ).expect(200);

      expect(JSON.stringify(female.body)).toBe(JSON.stringify(absent.body));
      expect(JSON.stringify(male.body)).toBe(JSON.stringify(absent.body));
    });
  });

  describe('hard filters', () => {
    it('excludes paid resources unless the tutor allows them', async () => {
      const withoutPaid = await post(learner({ limit: 50 })).expect(200);
      const withPaid = await post(
        learner({ limit: 50, allowPaid: true }),
      ).expect(200);

      const slugs = (body: { items: { resource: { slug: string } }[] }) =>
        body.items.map((item) => item.resource.slug);

      expect(slugs(withoutPaid.body)).not.toContain(
        'demo-algebra-revision-guide-book',
      );
      expect(slugs(withPaid.body)).toContain(
        'demo-algebra-revision-guide-book',
      );
    });

    it('excludes resources whose safety vetting has not passed', async () => {
      await database.db
        .update(resourceEnrichment)
        .set({ safetyVetStatus: 'pending', vettedBy: null, vettedAt: null })
        .where(
          eq(
            resourceEnrichment.resourceId,
            sql`(select id from resources where slug = 'demo-algebra-full-course')`,
          ),
        );

      const response = await post(learner({ limit: 50 })).expect(200);
      expect(
        response.body.items.map(
          (item: { resource: { slug: string } }) => item.resource.slug,
        ),
      ).not.toContain('demo-algebra-full-course');

      // restore
      await seedDemoCatalog(database.db);
    });

    it('excludes a resource with no enrichment row at all', async () => {
      const [row] = await database.db
        .insert(resources)
        .values({
          slug: 'demo-unenriched',
          title: 'Unenriched Resource',
          canonicalUrl: 'https://example.com/demo/unenriched',
          mediaType: 'reference',
          provider: 'Demo Open Press',
          authors: [],
          language: 'en-GB',
          licence: 'cc0',
          usageTier: 'open',
          costModel: 'free',
          sourceConnector: 'demo-seed',
          sourceTermsVerifiedAt: new Date(),
          publishedAt: new Date(),
        })
        .returning({ id: resources.id });

      const [node] = await database.db
        .select({ id: taxonomyNodes.id })
        .from(taxonomyNodes)
        .where(eq(taxonomyNodes.slug, NODE));
      await database.db
        .insert(resourceTaxonomy)
        .values({ resourceId: row!.id, nodeId: node!.id, primary: true });

      const response = await post(learner({ limit: 50 })).expect(200);
      expect(
        response.body.items.map(
          (item: { resource: { slug: string } }) => item.resource.slug,
        ),
      ).not.toContain('demo-unenriched');

      await database.db.delete(resources).where(eq(resources.id, row!.id));
    });

    it('names a cause when nothing matches', async () => {
      const response = await post(
        learner({ node: 'ks3-chemistry-acids-alkalis' }),
      ).expect(200);

      expect(response.body.items).toEqual([]);
      expect(response.body.emptyCause).toBe('no-candidates-in-subtree');
    });

    it('names the language cause when only the locale excludes everything', async () => {
      const response = await post(learner({ locale: 'fr-FR' })).expect(200);
      expect(response.body.items).toEqual([]);
      expect(response.body.emptyCause).toBe('all-filtered-by-language');
    });
  });

  describe('taxonomy reach', () => {
    it('finds a resource attached to an ancestor subject, not just the topic', async () => {
      const [maths] = await database.db
        .select({ id: taxonomyNodes.id })
        .from(taxonomyNodes)
        .where(eq(taxonomyNodes.slug, 'maths'));

      const [row] = await database.db
        .insert(resources)
        .values({
          slug: 'demo-general-maths-reference',
          title: 'General Maths Reference',
          canonicalUrl: 'https://example.com/demo/general-maths',
          mediaType: 'reference',
          provider: 'Demo Open Press',
          authors: [],
          language: 'en-GB',
          licence: 'cc0',
          usageTier: 'open',
          costModel: 'free',
          sourceConnector: 'demo-seed',
          sourceTermsVerifiedAt: new Date(),
          publishedAt: new Date(),
        })
        .returning({ id: resources.id });

      await database.db
        .insert(resourceTaxonomy)
        .values({ resourceId: row!.id, nodeId: maths!.id, primary: true });
      await database.db.insert(resourceEnrichment).values({
        resourceId: row!.id,
        source: 'curated',
        ageBandFit: ['14-16'],
        readingLevel: 9,
        difficulty: 'core',
        characterFitTags: [],
        qualityScore: '0.95',
        safetyVetStatus: 'passed',
        vettedBy: 'demo-curator@example.test',
        vettedAt: new Date(),
      });

      const response = await post(learner({ limit: 50 })).expect(200);
      const match = response.body.items.find(
        (item: { resource: { slug: string } }) =>
          item.resource.slug === 'demo-general-maths-reference',
      );

      expect(match).toBeDefined();
      expect(match.gate.level).toBe('exact');
      // Attached above the requested topic, so it reads as an ancestor match.
      expect(
        match.reasons.find(
          (reason: { factor: string }) => reason.factor === 'topic-relevance',
        ).level,
      ).toBe('ancestor');

      await database.db.delete(resources).where(eq(resources.id, row!.id));
    });

    it('does not let the candidate pre-filter bind on the seeded wedge', async () => {
      const response = await post(
        learner({ limit: 50, allowPaid: true }),
      ).expect(200);
      // If this ever equals the per-media-type cap we are silently truncating.
      expect(response.body.candidatesConsidered).toBeLessThan(40 * 6);
    });
  });

  describe('enrichment precedence', () => {
    it('yields one suggestion when a resource has both curated and model enrichment', async () => {
      const [row] = await database.db
        .select({ id: resources.id })
        .from(resources)
        .where(eq(resources.slug, 'demo-algebra-full-course'));

      await database.db.insert(resourceEnrichment).values({
        resourceId: row!.id,
        source: 'model',
        ageBandFit: ['17-18'],
        readingLevel: 12,
        difficulty: 'stretch',
        characterFitTags: ['space'],
        qualityScore: '0.10',
        safetyVetStatus: 'passed',
        vettedBy: 'demo-curator@example.test',
        vettedAt: new Date(),
        promptVersion: 'enrich/v1',
        model: 'claude-haiku-4-5',
      });

      const response = await post(learner({ limit: 50 })).expect(200);
      const matches = response.body.items.filter(
        (item: { resource: { slug: string } }) =>
          item.resource.slug === 'demo-algebra-full-course',
      );

      // One row, not two: the view resolves precedence before the join.
      expect(matches).toHaveLength(1);
      // And the curated row wins, so the age gate is still exact.
      expect(matches[0].gate.level).toBe('exact');

      await database.db
        .delete(resourceEnrichment)
        .where(
          and(
            eq(resourceEnrichment.resourceId, row!.id),
            eq(resourceEnrichment.source, 'model'),
          ),
        );
    });

    it('finds no provenance violations among stored enrichment', async () => {
      await expect(suggestions.auditEnrichmentProvenance()).resolves.toEqual(
        [],
      );
    });
  });

  describe('enrichment constraints enforced by the database', () => {
    const base = async () => {
      const [row] = await database.db
        .select({ id: resources.id })
        .from(resources)
        .where(eq(resources.slug, 'demo-algebra-identities-reference'));
      return row!.id;
    };

    it('rejects a model row with no provenance', async () => {
      await expect(
        database.db.insert(resourceEnrichment).values({
          resourceId: await base(),
          source: 'model',
          ageBandFit: ['14-16'],
          characterFitTags: [],
          safetyVetStatus: 'pending',
        }),
      ).rejects.toThrow(/resource_enrichment_model_provenance/);
    });

    it('rejects a curated row that claims model provenance', async () => {
      await expect(
        database.db.insert(resourceEnrichment).values({
          resourceId: await base(),
          source: 'deterministic',
          ageBandFit: ['14-16'],
          characterFitTags: [],
          safetyVetStatus: 'pending',
          promptVersion: 'enrich/v1',
          model: 'claude-haiku-4-5',
        }),
      ).rejects.toThrow(/resource_enrichment_non_model_provenance/);
    });

    it('refuses to record passed vetting without a named human', async () => {
      await expect(
        database.db.insert(resourceEnrichment).values({
          resourceId: await base(),
          source: 'deterministic',
          ageBandFit: ['14-16'],
          characterFitTags: [],
          safetyVetStatus: 'passed',
        }),
      ).rejects.toThrow(/resource_enrichment_vetting_needs_human/);
    });

    it('caps stored character tags so tag-spam cannot be imported', async () => {
      await expect(
        database.db.insert(resourceEnrichment).values({
          resourceId: await base(),
          source: 'deterministic',
          ageBandFit: ['14-16'],
          characterFitTags: [
            'animals',
            'art',
            'baking',
            'cars',
            'coding',
            'dance',
            'dinosaurs',
            'fashion',
            'football',
          ],
          safetyVetStatus: 'pending',
        }),
      ).rejects.toThrow(/resource_enrichment_tag_cap/);
    });
  });

  afterAll(async () => {
    await app?.close();
    await postgres?.stop();
  });
});
