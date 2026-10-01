import assert from 'node:assert/strict';
import test from 'node:test';
import {
  iscedFieldNodes,
  resolveTaxonomySeed,
  taxonomySeedNodes,
  TaxonomySeedError,
  ukNationalCurriculumNodes,
  wedgeTopicNodes,
} from '../dist/index.js';

test('ISCED-F seeds all 11 broad fields and 29 narrow fields', () => {
  const broad = iscedFieldNodes.filter((node) => node.parent === null);
  const narrow = iscedFieldNodes.filter((node) => node.parent !== null);
  assert.equal(broad.length, 11);
  assert.equal(narrow.length, 29);
});

test('the full seed resolves with parents before children', () => {
  const resolved = resolveTaxonomySeed();
  assert.equal(resolved.length, taxonomySeedNodes.length);

  const seen = new Set();
  for (const node of resolved) {
    if (node.parent !== null) {
      assert.ok(seen.has(node.parent), `${node.key} precedes its parent`);
    }
    seen.add(node.key);
  }
});

test('paths and depths are derived from the tree', () => {
  const byKey = new Map(resolveTaxonomySeed().map((node) => [node.key, node]));

  assert.equal(byKey.get('isced-f:05').depth, 0);
  assert.equal(byKey.get('isced-f:05').path, '05');
  assert.equal(byKey.get('isced-f:054').depth, 1);
  assert.equal(byKey.get('isced-f:054').path, '05.054');
  // The UK subject spine hangs beneath its ISCED-F field, forming one tree.
  assert.equal(byKey.get('uk-nc:maths').path, '05.054.maths');
  assert.equal(
    byKey.get('internal:ks4-maths-algebra').path,
    '05.054.maths.ks4-maths-algebra',
  );
  assert.equal(byKey.get('internal:ks4-maths-algebra').depth, 3);
});

test('every UK subject and wedge topic has a resolvable parent', () => {
  const keys = new Set(taxonomySeedNodes.map((n) => `${n.scheme}:${n.code}`));
  for (const node of [...ukNationalCurriculumNodes, ...wedgeTopicNodes]) {
    assert.ok(node.parent !== null, `${node.code} declares a parent`);
    assert.ok(
      keys.has(node.parent),
      `${node.code} parent ${node.parent} exists`,
    );
  }
});

test('the wedge covers maths and the three sciences across both key stages', () => {
  const subjects = new Set(wedgeTopicNodes.map((n) => n.parent));
  for (const expected of [
    'uk-nc:maths',
    'uk-nc:biology',
    'uk-nc:chemistry',
    'uk-nc:physics',
  ]) {
    assert.ok(subjects.has(expected), `wedge covers ${expected}`);
  }
  for (const stage of ['ks3', 'ks4']) {
    assert.ok(wedgeTopicNodes.some((n) => n.code.startsWith(`${stage}-`)));
  }
});

test('slugs are globally unique and URL-safe', () => {
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const slugs = new Set();
  for (const node of taxonomySeedNodes) {
    assert.match(node.slug, slugPattern, `${node.code} slug is URL-safe`);
    assert.ok(!slugs.has(node.slug), `${node.slug} is unique`);
    slugs.add(node.slug);
  }
});

test('rejects a duplicate slug', () => {
  assert.throws(
    () =>
      resolveTaxonomySeed([
        {
          scheme: 'internal',
          code: 'a',
          slug: 'same',
          parent: null,
          names: { en: 'A' },
        },
        {
          scheme: 'internal',
          code: 'b',
          slug: 'same',
          parent: null,
          names: { en: 'B' },
        },
      ]),
    TaxonomySeedError,
  );
});

test('rejects an unknown parent reference', () => {
  assert.throws(
    () =>
      resolveTaxonomySeed([
        {
          scheme: 'internal',
          code: 'a',
          slug: 'a',
          parent: 'internal:missing',
          names: { en: 'A' },
        },
      ]),
    TaxonomySeedError,
  );
});

test('rejects a cycle', () => {
  assert.throws(
    () =>
      resolveTaxonomySeed([
        {
          scheme: 'internal',
          code: 'a',
          slug: 'a',
          parent: 'internal:b',
          names: { en: 'A' },
        },
        {
          scheme: 'internal',
          code: 'b',
          slug: 'b',
          parent: 'internal:a',
          names: { en: 'B' },
        },
      ]),
    TaxonomySeedError,
  );
});

test('rejects a node with no English label', () => {
  assert.throws(
    () =>
      resolveTaxonomySeed([
        {
          scheme: 'internal',
          code: 'a',
          slug: 'a',
          parent: null,
          names: { fr: 'A' },
        },
      ]),
    TaxonomySeedError,
  );
});
