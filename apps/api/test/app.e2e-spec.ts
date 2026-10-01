import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Auth0ClaimsSchema } from '@tutorforge/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';
import { UsersService } from '../src/users/users.service.js';

describe('API integration (PostgreSQL)', () => {
  let app!: INestApplication<App>;
  let postgres: StartedPostgreSqlContainer | undefined;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:16-alpine').start();
    process.env.DATABASE_URL = postgres.getConnectionUri();
    process.env.AUTH0_DOMAIN = 'tenant.example.test';
    process.env.AUTH0_AUDIENCE = 'https://api.tutorforge.test';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await migrate(app.get(DatabaseService).db, {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });
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

  afterAll(async () => {
    await app?.close();
    await postgres?.stop();
  });
});
