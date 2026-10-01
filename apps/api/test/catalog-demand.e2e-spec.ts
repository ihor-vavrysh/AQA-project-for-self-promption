import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { CatalogService } from '../src/catalog/catalog.service.js';
import { DatabaseService } from '../src/database/database.service.js';
import { taxonomyNodes } from '../src/database/schema.js';

describe('Catalog topic demand', () => {
  let app!: INestApplication<App>;
  let postgres: StartedPostgreSqlContainer | undefined;
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
    catalog = app.get(CatalogService);

    await migrate(app.get(DatabaseService).db, {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });

    await app.get(DatabaseService).db.insert(taxonomyNodes).values({
      scheme: 'uk-nc',
      code: 'algebra',
      slug: 'ks4-maths-algebra',
      path: '05.054.algebra',
      depth: 2,
      names: { en: 'Algebra (KS4)' },
    });
  });

  afterAll(async () => {
    await app.close();
    await postgres?.stop();
  });

  it('records a demand signal and aggregates it by topic', async () => {
    const first = await catalog.recordTopicDemand('ks4-maths-algebra', 'alice@example.com');
    expect(first.nodeSlug).toBe('ks4-maths-algebra');
    expect(first.count).toBe(1);

    await catalog.recordTopicDemand('ks4-maths-algebra', 'alice@example.com');
    const demand = await catalog.listTopicDemand();
    expect(demand[0]?.slug).toBe('ks4-maths-algebra');
    expect(demand[0]?.count).toBe(2);

    const response = await request(app.getHttpServer())
      .post('/api/v1/catalog/nodes/ks4-maths-algebra/request')
      .send({ requestedBy: 'bob@example.com' })
      .expect(201);

    expect(response.body.nodeSlug).toBe('ks4-maths-algebra');
    expect(response.body.count).toBe(1);
  });
});
