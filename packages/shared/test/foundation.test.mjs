import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  Auth0ClaimsSchema,
  CreateLearnerRequestSchema,
  UpdateLearnerRequestSchema,
} from '../dist/index.js';

const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);
const rootPackage = JSON.parse(
  readFileSync(resolve(packageRoot, 'package.json'), 'utf8'),
);
const sharedPackage = JSON.parse(
  readFileSync(resolve(packageRoot, 'packages/shared/package.json'), 'utf8'),
);

test('workspace exposes its foundational quality gates', () => {
  for (const script of ['lint', 'format:check', 'typecheck', 'test']) {
    assert.equal(
      typeof rootPackage.scripts[script],
      'string',
      `${script} script exists`,
    );
  }
  assert.equal(sharedPackage.name, '@tutorforge/shared');
  assert.equal(typeof sharedPackage.scripts.test, 'string');
});

test('Auth0 claims require a non-empty subject and validate email', () => {
  assert.equal(
    Auth0ClaimsSchema.parse({
      sub: 'auth0|tutor-1',
      email: 'tutor@example.test',
    }).sub,
    'auth0|tutor-1',
  );
  assert.equal(
    Auth0ClaimsSchema.safeParse({ email: 'not-an-email' }).success,
    false,
  );
});

test('mentee profiles require pseudonymous, valid learning context', () => {
  const profile = {
    pseudonym: 'Learner 01',
    ageBand: '11-13',
    locale: 'en-GB',
    curriculumCode: 'KS3',
    interests: ['space'],
    learningPreference: 'step-by-step',
    confidenceLevel: 'developing',
    attentionSpan: '10-20-minutes',
    gender: null,
    subject: 'Mathematics',
    level: 'Year 8',
  };

  assert.equal(CreateLearnerRequestSchema.safeParse(profile).success, true);
  assert.equal(
    CreateLearnerRequestSchema.safeParse({ ...profile, ageBand: '10-12' })
      .success,
    false,
  );
  assert.equal(
    CreateLearnerRequestSchema.safeParse({
      ...profile,
      realName: 'Not allowed',
    }).success,
    false,
  );
  assert.equal(UpdateLearnerRequestSchema.safeParse({}).success, false);
  assert.equal(
    UpdateLearnerRequestSchema.safeParse({ gender: null }).success,
    true,
  );
});
