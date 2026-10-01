import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTaxonomyTree,
  checkUsageRights,
  assertUsageRights,
  DEPTH_GATE,
  isNodePublishable,
  LICENCE_CODES,
  LICENCE_USAGE_TIER,
  ResourceInputSchema,
  resolveOutboundUrl,
  retainPublishedWithAncestors,
  TIER_CAPABILITIES,
  USAGE_TIERS,
} from '../dist/index.js';

/** Returns a copy without `key`, for testing that a field is required. */
const omit = (object, key) => {
  const copy = { ...object };
  delete copy[key];
  return copy;
};

/** A valid open-licence resource; individual tests bend one field at a time. */
const openResource = {
  slug: 'openstax-algebra-basics',
  title: 'Algebra Basics',
  canonicalUrl: 'https://openstax.org/books/algebra/pages/1',
  mediaType: 'reference',
  provider: 'OpenStax',
  authors: ['OpenStax'],
  language: 'en-GB',
  licence: 'cc-by',
  usageTier: 'open',
  attributionText: 'OpenStax, CC BY 4.0',
  costModel: 'free',
  sourceConnector: 'manual-csv',
  sourceTermsVerifiedAt: '2026-10-01T00:00:00.000Z',
};

const embedResource = {
  ...openResource,
  slug: 'yt-quadratics',
  title: 'Solving Quadratics',
  canonicalUrl: 'https://www.youtube.com/watch?v=abc',
  embedUrl: 'https://www.youtube.com/embed/abc',
  mediaType: 'video',
  provider: 'YouTube',
  licence: 'platform-tos',
  usageTier: 'embed',
  attributionText: null,
};

const commercialResource = {
  ...openResource,
  slug: 'cgp-gcse-maths',
  title: 'GCSE Maths Revision Guide',
  canonicalUrl: 'https://example.com/books/gcse-maths',
  mediaType: 'book',
  provider: 'Example Publisher',
  licence: 'proprietary',
  usageTier: 'commercial',
  costModel: 'paid',
  attributionText: null,
};

test('every licence maps to exactly one usage tier', () => {
  for (const licence of LICENCE_CODES) {
    const tier = LICENCE_USAGE_TIER[licence];
    assert.ok(USAGE_TIERS.includes(tier), `${licence} maps to a known tier`);
  }
});

test('only the commercial tier may carry an affiliate link', () => {
  const affiliateTiers = USAGE_TIERS.filter(
    (tier) => TIER_CAPABILITIES[tier].affiliate,
  );
  assert.deepEqual(affiliateTiers, ['commercial']);
});

test('only the open tier may mirror content', () => {
  const mirrorTiers = USAGE_TIERS.filter(
    (tier) => TIER_CAPABILITIES[tier].mirror,
  );
  assert.deepEqual(mirrorTiers, ['open']);
});

test('valid resources in each tier pass the rights check', () => {
  for (const resource of [openResource, embedResource, commercialResource]) {
    assert.deepEqual(
      checkUsageRights(resource),
      [],
      `${resource.slug} has no violations`,
    );
    assert.doesNotThrow(() => ResourceInputSchema.parse(resource));
  }
});

test('a licence paired with the wrong tier is rejected', () => {
  assert.deepEqual(
    checkUsageRights({ ...openResource, usageTier: 'commercial' }),
    ['licence-tier-mismatch'],
  );
  assert.throws(() =>
    ResourceInputSchema.parse({ ...openResource, usageTier: 'commercial' }),
  );
});

test('commercial material must never be embedded', () => {
  const violations = checkUsageRights({
    ...commercialResource,
    embedUrl: 'https://example.com/embed/gcse-maths',
  });
  assert.ok(violations.includes('commercial-must-not-embed'));
  assert.throws(() =>
    ResourceInputSchema.parse({
      ...commercialResource,
      embedUrl: 'https://example.com/embed/gcse-maths',
    }),
  );
});

test('commercial material must never be mirrored', () => {
  assert.ok(
    checkUsageRights({
      ...commercialResource,
      mirroredPath: 'mirror/gcse-maths.pdf',
    }).includes('commercial-must-not-mirror'),
  );
});

test('embed-tier material must never be mirrored', () => {
  assert.ok(
    checkUsageRights({
      ...embedResource,
      mirroredPath: 'mirror/quadratics.mp4',
    }).includes('embed-must-not-mirror'),
  );
});

test('embed-tier material requires an embed URL', () => {
  const withoutEmbed = omit(embedResource, 'embedUrl');
  assert.ok(
    checkUsageRights(withoutEmbed).includes('embed-requires-embed-url'),
  );
  assert.throws(() => ResourceInputSchema.parse(withoutEmbed));
});

test('open and embed material must never carry an affiliate link', () => {
  for (const resource of [openResource, embedResource]) {
    assert.ok(
      checkUsageRights({
        ...resource,
        affiliateUrl: 'https://affiliate.example.com/go?id=1',
      }).includes('non-commercial-must-not-affiliate'),
      `${resource.slug} rejects an affiliate link`,
    );
  }
});

test('attribution-requiring licences must carry attribution text', () => {
  for (const licence of ['cc-by', 'cc-by-sa']) {
    assert.ok(
      checkUsageRights({
        ...openResource,
        licence,
        attributionText: '   ',
      }).includes('missing-attribution'),
      `${licence} requires attribution`,
    );
  }
  // CC0 and public domain do not.
  for (const licence of ['cc0', 'public-domain']) {
    assert.deepEqual(
      checkUsageRights({ ...openResource, licence, attributionText: null }),
      [],
    );
  }
});

test('all violations are reported together, not just the first', () => {
  const violations = checkUsageRights({
    licence: 'proprietary',
    usageTier: 'open',
    embedUrl: 'https://example.com/embed',
    mirroredPath: 'mirror/thing.pdf',
    affiliateUrl: 'https://affiliate.example.com/go',
  });
  assert.ok(violations.includes('licence-tier-mismatch'));
  assert.ok(violations.includes('non-commercial-must-not-affiliate'));
  assert.ok(violations.length >= 2);
});

test('assertUsageRights throws and names the violations', () => {
  assert.throws(
    () => assertUsageRights({ ...openResource, usageTier: 'embed' }),
    /licence-tier-mismatch/,
  );
  assert.doesNotThrow(() => assertUsageRights(openResource));
});

test('outbound URL uses the affiliate link only where the tier permits it', () => {
  assert.equal(
    resolveOutboundUrl({
      usageTier: 'commercial',
      canonicalUrl: 'https://example.com/book',
      affiliateUrl: 'https://affiliate.example.com/go?id=1',
    }),
    'https://affiliate.example.com/go?id=1',
  );
  assert.equal(
    resolveOutboundUrl({
      usageTier: 'open',
      canonicalUrl: 'https://openstax.org/book',
      affiliateUrl: 'https://affiliate.example.com/go?id=1',
    }),
    'https://openstax.org/book',
  );
  assert.equal(
    resolveOutboundUrl({
      usageTier: 'commercial',
      canonicalUrl: 'https://example.com/book',
      affiliateUrl: null,
    }),
    'https://example.com/book',
  );
});

test('the depth gate needs both resource count and media-type spread', () => {
  assert.equal(
    isNodePublishable({
      resourceCount: DEPTH_GATE.minResources,
      mediaTypeCount: DEPTH_GATE.minMediaTypes,
    }),
    true,
  );
  assert.equal(
    isNodePublishable({
      resourceCount: DEPTH_GATE.minResources - 1,
      mediaTypeCount: DEPTH_GATE.minMediaTypes,
    }),
    false,
  );
  // Plenty of resources but all of one kind is still not a publishable node.
  assert.equal(
    isNodePublishable({
      resourceCount: 100,
      mediaTypeCount: DEPTH_GATE.minMediaTypes - 1,
    }),
    false,
  );
});

test('an ISBN must be ISBN-10 or ISBN-13', () => {
  assert.doesNotThrow(() =>
    ResourceInputSchema.parse({ ...commercialResource, isbn: '9781234567897' }),
  );
  assert.throws(() =>
    ResourceInputSchema.parse({ ...commercialResource, isbn: '123' }),
  );
});

test('source terms verification is mandatory on every resource', () => {
  const withoutTerms = omit(openResource, 'sourceTermsVerifiedAt');
  assert.throws(() => ResourceInputSchema.parse(withoutTerms));
});

// --- Tree assembly ----------------------------------------------------------

const node = (id, parentId, published, extra = {}) => ({
  id,
  parentId,
  scheme: 'internal',
  code: id,
  slug: id,
  path: id,
  depth: parentId === null ? 0 : 1,
  names: { en: id },
  resourceCount: 0,
  mediaTypeCount: 0,
  published,
  ...extra,
});

test('buildTaxonomyTree nests children under their parents', () => {
  const tree = buildTaxonomyTree([
    node('root', null, true),
    node('child-a', 'root', true),
    node('child-b', 'root', true),
  ]);

  assert.equal(tree.length, 1);
  assert.equal(tree[0].id, 'root');
  assert.deepEqual(
    tree[0].children.map((c) => c.id),
    ['child-a', 'child-b'],
  );
});

test('buildTaxonomyTree treats a node with a missing parent as a root', () => {
  const tree = buildTaxonomyTree([node('orphan', 'absent', true)]);
  assert.deepEqual(
    tree.map((n) => n.id),
    ['orphan'],
  );
});

test('retainPublishedWithAncestors keeps the path to a published topic', () => {
  const kept = retainPublishedWithAncestors([
    node('field', null, false),
    node('subject', 'field', false),
    node('topic', 'subject', true),
    node('other-subject', 'field', false),
  ]);

  // Unpublished ancestors survive so the published topic stays reachable...
  assert.deepEqual(
    kept.map((n) => n.id),
    ['field', 'subject', 'topic'],
  );
  // ...but an unpublished branch with nothing published beneath it is dropped.
  assert.ok(!kept.some((n) => n.id === 'other-subject'));
});

test('retainPublishedWithAncestors returns nothing when no node is published', () => {
  assert.deepEqual(
    retainPublishedWithAncestors([
      node('field', null, false),
      node('subject', 'field', false),
    ]),
    [],
  );
});
