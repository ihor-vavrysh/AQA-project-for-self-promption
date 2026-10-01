import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import { resolveTaxonomySeed } from '@tutorforge/taxonomy';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { resolve } from 'node:path';
import { DatabaseService } from '../src/database/database.service.js';
import { CatalogService } from '../src/catalog/catalog.service.js';
import { seedTaxonomy } from '../src/catalog/taxonomy-seed.js';
import {
  resourceTaxonomy,
  resources,
  taxonomyNodes,
} from '../src/database/schema.js';

const now = new Date();

/** A valid resource row; individual tests bend one field to break one rule. */
const openRow = {
  slug: 'openstax-algebra',
  title: 'Algebra Basics',
  canonicalUrl: 'https://openstax.org/books/algebra',
  mediaType: 'reference' as const,
  provider: 'OpenStax',
  authors: ['OpenStax'],
  language: 'en-GB',
  licence: 'cc-by' as const,
  usageTier: 'open' as const,
  attributionText: 'OpenStax, CC BY 4.0',
  costModel: 'free' as const,
  sourceConnector: 'manual-csv',
  sourceTermsVerifiedAt: now,
  publishedAt: now,
};

describe('Catalog integration (PostgreSQL)', () => {
  let app!: INestApplication<App>;
  let postgres: StartedPostgreSqlContainer | undefined;
  let database!: DatabaseService;
  let catalog!: CatalogService;

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
    catalog = app.get(CatalogService);

    await migrate(database.db, {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });
    await seedTaxonomy(database.db);
  });

  beforeEach(async () => {
    await database.db.delete(resourceTaxonomy);
    await database.db.delete(resources);
    await database.db
      .update(taxonomyNodes)
      .set({ resourceCount: 0, mediaTypeCount: 0, publishedAt: null });
  });

  describe('taxonomy seed', () => {
    it('loads the whole spine and links the schemes into one tree', async () => {
      const expected = resolveTaxonomySeed();
      const counted = await database.db
        .select({ value: sql<number>`count(*)::int` })
        .from(taxonomyNodes);

      expect(counted[0]?.value).toBe(expected.length);

      const maths = await catalog.getNodeBySlug('maths');
      expect(maths.scheme).toBe('uk-nc');
      // UK subjects hang beneath their ISCED-F field (docs/CATALOG.md §2).
      expect(maths.path).toBe('05.054.maths');
      expect(maths.depth).toBe(2);
    });

    it('is idempotent', async () => {
      const before = await database.db
        .select({ value: sql<number>`count(*)::int` })
        .from(taxonomyNodes);
      await seedTaxonomy(database.db);
      const after = await database.db
        .select({ value: sql<number>`count(*)::int` })
        .from(taxonomyNodes);

      expect(after[0]?.value).toBe(before[0]?.value);
    });
  });

  describe('usage-rights invariants enforced by the database', () => {
    it('accepts a correctly licensed open resource', async () => {
      await expect(
        database.db.insert(resources).values(openRow),
      ).resolves.toBeDefined();
    });

    it('rejects a licence paired with the wrong usage tier', async () => {
      await expect(
        database.db
          .insert(resources)
          .values({ ...openRow, slug: 'x1', usageTier: 'commercial' }),
      ).rejects.toThrow(/resources_licence_matches_usage_tier/);
    });

    it('rejects an embed URL on commercial material', async () => {
      await expect(
        database.db.insert(resources).values({
          ...openRow,
          slug: 'x2',
          licence: 'proprietary',
          usageTier: 'commercial',
          attributionText: null,
          embedUrl: 'https://example.com/embed',
        }),
      ).rejects.toThrow(/resources_commercial_links_only/);
    });

    it('rejects mirrored content on commercial material', async () => {
      await expect(
        database.db.insert(resources).values({
          ...openRow,
          slug: 'x3',
          licence: 'proprietary',
          usageTier: 'commercial',
          attributionText: null,
          mirroredPath: 'mirror/book.pdf',
        }),
      ).rejects.toThrow(/resources_commercial_links_only/);
    });

    it('rejects embed-tier material without an embed URL', async () => {
      await expect(
        database.db.insert(resources).values({
          ...openRow,
          slug: 'x4',
          licence: 'platform-tos',
          usageTier: 'embed',
          attributionText: null,
        }),
      ).rejects.toThrow(/resources_embed_tier_requires_embed_url/);
    });

    it('rejects mirrored content on embed-tier material', async () => {
      await expect(
        database.db.insert(resources).values({
          ...openRow,
          slug: 'x5',
          licence: 'platform-tos',
          usageTier: 'embed',
          attributionText: null,
          embedUrl: 'https://www.youtube.com/embed/abc',
          mirroredPath: 'mirror/video.mp4',
        }),
      ).rejects.toThrow(/resources_embed_tier_requires_embed_url/);
    });

    it('rejects an affiliate link on non-commercial material', async () => {
      await expect(
        database.db.insert(resources).values({
          ...openRow,
          slug: 'x6',
          affiliateUrl: 'https://affiliate.example.com/go?id=1',
        }),
      ).rejects.toThrow(/resources_affiliate_commercial_only/);
    });

    it('rejects an attribution-requiring licence with blank attribution', async () => {
      await expect(
        database.db
          .insert(resources)
          .values({ ...openRow, slug: 'x7', attributionText: '   ' }),
      ).rejects.toThrow(/resources_attribution_present_when_required/);
    });

    it('finds no rights violations among stored resources', async () => {
      await database.db.insert(resources).values(openRow);
      await expect(catalog.auditUsageRights()).resolves.toEqual([]);
    });
  });

  describe('depth gate', () => {
    const mediaTypes = [
      'course',
      'tutorial',
      'book',
      'reference',
      'audio',
      'video',
    ] as const;

    const seedResources = async (nodeSlug: string, howMany: number) => {
      const node = await catalog.getNodeBySlug(nodeSlug);
      for (let index = 0; index < howMany; index += 1) {
        const [row] = await database.db
          .insert(resources)
          .values({
            ...openRow,
            slug: `${nodeSlug}-resource-${index}`,
            title: `Resource ${index}`,
            mediaType: mediaTypes[index % mediaTypes.length]!,
          })
          .returning({ id: resources.id });
        await database.db
          .insert(resourceTaxonomy)
          .values({ resourceId: row!.id, nodeId: node.id, primary: true });
      }
    };

    it('leaves a thin node unpublished', async () => {
      await seedResources('ks4-maths-algebra', 4);
      await catalog.refreshDepthGate();

      expect((await catalog.getNodeBySlug('ks4-maths-algebra')).published).toBe(
        false,
      );
    });

    it('publishes a node once it has enough resources and media spread', async () => {
      await seedResources('ks4-maths-algebra', 12);
      await catalog.refreshDepthGate();

      const node = await catalog.getNodeBySlug('ks4-maths-algebra');
      expect(node.published).toBe(true);
      expect(node.resourceCount).toBe(12);
      expect(node.mediaTypeCount).toBe(6);
    });

    it('rolls counts up to ancestors so a parent subject publishes too', async () => {
      await seedResources('ks4-maths-algebra', 12);
      await catalog.refreshDepthGate();

      expect((await catalog.getNodeBySlug('maths')).resourceCount).toBe(12);
      expect((await catalog.getNodeBySlug('maths')).published).toBe(true);
    });

    it('unpublishes a node that falls back below the gate', async () => {
      await seedResources('ks4-maths-algebra', 12);
      await catalog.refreshDepthGate();
      await database.db
        .delete(resources)
        .where(eq(resources.slug, 'ks4-maths-algebra-resource-0'));
      await catalog.refreshDepthGate();

      expect((await catalog.getNodeBySlug('ks4-maths-algebra')).published).toBe(
        false,
      );
    });

    it('hides unpublished nodes from the public tree but keeps ancestors of published ones', async () => {
      await seedResources('ks4-maths-algebra', 12);
      await catalog.refreshDepthGate();

      const published = await catalog.getTaxonomyTree({ publishedOnly: true });
      const slugs = new Set<string>();
      const walk = (nodes: { slug: string; children: unknown[] }[]) => {
        for (const node of nodes) {
          slugs.add(node.slug);
          walk(node.children as typeof nodes);
        }
      };
      walk(published as never);

      expect(slugs.has('ks4-maths-algebra')).toBe(true);
      expect(slugs.has('maths')).toBe(true);
      expect(slugs.has('mathematics-and-statistics')).toBe(true);
      // A sibling subject with nothing published stays out of the public tree.
      expect(slugs.has('chemistry')).toBe(false);

      const everything = await catalog.getTaxonomyTree({
        publishedOnly: false,
      });
      const allSlugs = new Set<string>();
      const walkAll = (nodes: { slug: string; children: unknown[] }[]) => {
        for (const node of nodes) {
          allSlugs.add(node.slug);
          walkAll(node.children as typeof nodes);
        }
      };
      walkAll(everything as never);
      expect(allSlugs.has('chemistry')).toBe(true);
    });
  });

  describe('resource listing and detail', () => {
    beforeEach(async () => {
      const algebra = await catalog.getNodeBySlug('ks4-maths-algebra');
      const rows = await database.db
        .insert(resources)
        .values([
          { ...openRow, slug: 'open-ref', mediaType: 'reference' },
          {
            ...openRow,
            slug: 'open-video',
            mediaType: 'video',
            embedUrl: 'https://example.org/embed/open',
          },
          {
            ...openRow,
            slug: 'paid-book',
            mediaType: 'book',
            licence: 'proprietary',
            usageTier: 'commercial',
            attributionText: null,
            costModel: 'paid',
            affiliateUrl: 'https://affiliate.example.com/go?id=7',
          },
        ])
        .returning({ id: resources.id });

      await database.db.insert(resourceTaxonomy).values(
        rows.map((row) => ({
          resourceId: row.id,
          nodeId: algebra.id,
          primary: true,
        })),
      );
    });

    it('lists resources in a subtree with facet counts', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/catalog/resources?node=maths')
        .expect(200);

      expect(response.body.total).toBe(3);
      expect(response.body.facets.mediaType).toEqual({
        reference: 1,
        video: 1,
        book: 1,
      });
      expect(response.body.facets.costModel).toEqual({ free: 2, paid: 1 });
    });

    it('filters by media type', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/catalog/resources?node=maths&mediaType=video')
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.items[0].slug).toBe('open-video');
    });

    it('returns 404 when filtering by an unknown node', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/catalog/resources?node=not-a-node')
        .expect(404);
    });

    it('exposes the embed URL for open material', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/catalog/resources/open-video')
        .expect(200);

      expect(response.body.embedUrl).toBe('https://example.org/embed/open');
      expect(response.body.outboundUrl).toBe(openRow.canonicalUrl);
      expect(response.body.capabilities).toEqual({
        deepLink: true,
        embed: true,
        mirror: true,
        affiliate: false,
      });
    });

    it('never exposes an embed URL for commercial material and uses the affiliate link', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/catalog/resources/paid-book')
        .expect(200);

      expect(response.body.embedUrl).toBeNull();
      expect(response.body.outboundUrl).toBe(
        'https://affiliate.example.com/go?id=7',
      );
      expect(response.body.capabilities.embed).toBe(false);
      expect(response.body.capabilities.affiliate).toBe(true);
    });

    it('hides unpublished resources from the public endpoints', async () => {
      await database.db
        .update(resources)
        .set({ publishedAt: null })
        .where(eq(resources.slug, 'open-ref'));

      await request(app.getHttpServer())
        .get('/api/v1/catalog/resources/open-ref')
        .expect(404);
    });

    it('serves the catalog without authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/catalog/taxonomy')
        .expect(200);
    });
  });

  afterAll(async () => {
    await app?.close();
    await postgres?.stop();
  });
});
