import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Auth0ClaimsSchema } from '@tutorforge/shared';
import type { Auth0Claims } from '@tutorforge/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { resolve } from 'node:path';
import { DatabaseService } from '../src/database/database.service.js';
import { LearnersController } from '../src/learners/learners.controller.js';
import { LearnersService } from '../src/learners/learners.service.js';
import { UsersService } from '../src/users/users.service.js';

const integrationAuthGuard: CanActivate = {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: Auth0Claims;
    }>();
    const match = /^Bearer (.+)$/.exec(request.headers.authorization ?? '');

    if (!match?.[1]) {
      throw new UnauthorizedException();
    }

    request.user = Auth0ClaimsSchema.parse({
      sub: `auth0|integration-${match[1]}`,
    });
    return true;
  },
};

const learnerProfile = {
  pseudonym: 'Learner 01',
  ageBand: '11-13',
  locale: 'en-GB',
  curriculumCode: 'KS3',
  interests: ['space', 'music'],
  learningPreference: 'step-by-step',
  confidenceLevel: 'developing',
  attentionSpan: '10-20-minutes',
  gender: null,
  subject: 'Mathematics',
  level: 'Year 8',
};

describe('API integration (PostgreSQL)', () => {
  let app!: INestApplication<App>;
  let authenticatedApp!: INestApplication<App>;
  let postgres: StartedPostgreSqlContainer | undefined;

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
    await migrate(app.get(DatabaseService).db, {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });

    const authenticatedModule = await Test.createTestingModule({
      controllers: [LearnersController],
      providers: [
        {
          provide: ConfigService,
          useValue: { getOrThrow: (key: string) => process.env[key] },
        },
        DatabaseService,
        LearnersService,
        UsersService,
        { provide: APP_GUARD, useValue: integrationAuthGuard },
      ],
    }).compile();
    authenticatedApp = authenticatedModule.createNestApplication();
    await authenticatedApp.init();
  });

  it('runs migrations and checks the live database', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });

    expect(response.body).toEqual({ status: 'ok' });
  });

  it('requires a verified Auth0 token for tutor identity', async () => {
    await request(app.getHttpServer()).get('/api/v1/me').expect(401);
  });

  it('persists and updates the Auth0-backed tutor identity', async () => {
    const users = app.get(UsersService);
    const claims = Auth0ClaimsSchema.parse({
      sub: 'auth0|integration-tutor',
      email: 'tutor@example.test',
    });
    const created = await users.findOrCreate(claims);
    const updated = await users.findOrCreate(
      Auth0ClaimsSchema.parse({
        sub: 'auth0|integration-tutor',
        email: 'updated@example.test',
      }),
    );
    const withoutEmail = await users.findOrCreate(
      Auth0ClaimsSchema.parse({ sub: 'auth0|integration-tutor' }),
    );

    expect(created.id).toBe(updated.id);
    expect(updated.email).toBe('updated@example.test');
    expect(withoutEmail.email).toBe('updated@example.test');
  });

  it('creates, lists, reads, updates, and deletes tutor-owned mentee profiles', async () => {
    const api = authenticatedApp.getHttpServer();
    const tutorA = { Authorization: 'Bearer tutor-a' };
    const tutorB = { Authorization: 'Bearer tutor-b' };

    const created = await request(api)
      .post('/api/v1/learners')
      .set(tutorA)
      .send(learnerProfile)
      .expect(201);

    expect(created.body).toMatchObject({
      ...learnerProfile,
      id: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const learnerId = created.body.id as string;

    await request(api)
      .get('/api/v1/learners')
      .set(tutorA)
      .expect(200)
      .expect([created.body]);

    await request(api)
      .get(`/api/v1/learners/${learnerId}`)
      .set(tutorA)
      .expect(200)
      .expect(created.body);

    const updated = await request(api)
      .patch(`/api/v1/learners/${learnerId}`)
      .set(tutorA)
      .send({ pseudonym: 'Learner 01B', gender: 'they/them' })
      .expect(200);

    expect(updated.body).toMatchObject({
      ...learnerProfile,
      pseudonym: 'Learner 01B',
      gender: 'they/them',
      id: learnerId,
    });
    expect(Date.parse(updated.body.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(created.body.updatedAt),
    );

    await request(api)
      .get('/api/v1/learners')
      .set(tutorB)
      .expect(200)
      .expect([]);

    await request(api)
      .get(`/api/v1/learners/${learnerId}`)
      .set(tutorB)
      .expect(404);

    await request(api)
      .patch(`/api/v1/learners/${learnerId}`)
      .set(tutorB)
      .send({ pseudonym: 'Stolen profile' })
      .expect(404);

    await request(api)
      .delete(`/api/v1/learners/${learnerId}`)
      .set(tutorB)
      .expect(404);

    await request(api)
      .delete(`/api/v1/learners/${learnerId}`)
      .set(tutorA)
      .expect(204);

    await request(api)
      .get(`/api/v1/learners/${learnerId}`)
      .set(tutorA)
      .expect(404);
  });

  it('rejects invalid learner profile input and unauthenticated requests', async () => {
    const api = authenticatedApp.getHttpServer();

    await request(api).get('/api/v1/learners').expect(401);
    await request(api)
      .post('/api/v1/learners')
      .set('Authorization', 'Bearer tutor-a')
      .send({ ...learnerProfile, ageBand: '10-12' })
      .expect(400);
    await request(api)
      .post('/api/v1/learners')
      .set('Authorization', 'Bearer tutor-a')
      .send({ ...learnerProfile, realName: 'Not accepted' })
      .expect(400);
    await request(api)
      .patch('/api/v1/learners/00000000-0000-4000-8000-000000000000')
      .set('Authorization', 'Bearer tutor-a')
      .send({})
      .expect(400);
  });

  afterAll(async () => {
    await authenticatedApp?.close();
    await app?.close();
    await postgres?.stop();
  });
});
