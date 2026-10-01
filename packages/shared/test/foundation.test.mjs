import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Auth0ClaimsSchema } from '../dist/index.js';

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
