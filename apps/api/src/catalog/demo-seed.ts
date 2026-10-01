import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  resourceEnrichment,
  resourceTaxonomy,
  resources,
  taxonomyNodes,
} from '../database/schema.js';

/**
 * Demo catalog data for the `ks4-maths-algebra` wedge topic — enough resources across
 * enough media types to clear the depth gate so suggestions are meaningful.
 *
 * Providers, titles and URLs are deliberately fictional (`example.com` is reserved for
 * documentation). Attributing invented resources to real publishers would be fabricating
 * records, and a demo seed does not need real brands.
 *
 * Every row is hand-curated: `source: 'curated'`, vetted by a named human. Phase 4b adds
 * `source: 'model'` rows alongside these without touching the ranker.
 */

const VETTED_BY = 'demo-curator@example.test';

interface DemoResource {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly mediaType:
    'course' | 'tutorial' | 'book' | 'reference' | 'audio' | 'video';
  readonly provider: string;
  readonly licence:
    'cc0' | 'public-domain' | 'cc-by' | 'platform-tos' | 'proprietary';
  readonly usageTier: 'open' | 'embed' | 'commercial';
  readonly costModel: 'free' | 'freemium' | 'paid';
  readonly durationSeconds?: number;
  readonly pageCount?: number;
  readonly ageBandFit: readonly string[];
  readonly readingLevel: number | null;
  readonly difficulty: 'foundation' | 'core' | 'stretch';
  readonly characterFitTags: readonly string[];
  readonly qualityScore: number;
  readonly primary?: boolean;
}

const open = (licence: DemoResource['licence'] = 'cc0') => ({
  licence,
  usageTier: 'open' as const,
  costModel: 'free' as const,
});

const DEMO_RESOURCES: readonly DemoResource[] = [
  // --- video -----------------------------------------------------------------
  {
    slug: 'demo-algebra-rearranging-video',
    title: 'Rearranging Formulae, Step by Step',
    description: 'A worked walkthrough of changing the subject of a formula.',
    mediaType: 'video',
    provider: 'Demo Video Channel',
    licence: 'platform-tos',
    usageTier: 'embed',
    costModel: 'free',
    durationSeconds: 540,
    ageBandFit: ['14-16'],
    readingLevel: null,
    difficulty: 'core',
    characterFitTags: ['puzzles'],
    qualityScore: 0.86,
    primary: true,
  },
  {
    slug: 'demo-algebra-football-stats-video',
    title: 'Algebra in Football Statistics',
    description: 'Builds simple equations from league tables and player data.',
    mediaType: 'video',
    provider: 'Demo Sports Learning',
    licence: 'platform-tos',
    usageTier: 'embed',
    costModel: 'free',
    durationSeconds: 420,
    ageBandFit: ['14-16'],
    readingLevel: null,
    difficulty: 'foundation',
    characterFitTags: ['football', 'sport'],
    qualityScore: 0.82,
    primary: true,
  },
  {
    slug: 'demo-algebra-space-equations-video',
    title: 'Equations for Orbital Speed',
    description:
      'Uses rearranging to find orbital speed from radius and period.',
    mediaType: 'video',
    provider: 'Demo Video Channel',
    licence: 'platform-tos',
    usageTier: 'embed',
    costModel: 'free',
    durationSeconds: 660,
    ageBandFit: ['17-18'],
    readingLevel: null,
    difficulty: 'stretch',
    characterFitTags: ['space', 'science-fiction'],
    qualityScore: 0.79,
  },
  {
    slug: 'demo-algebra-gaming-sequences-video',
    title: 'Sequences in Game Level Design',
    description: 'Arithmetic and quadratic sequences behind difficulty curves.',
    mediaType: 'video',
    provider: 'Demo Code Club',
    licence: 'platform-tos',
    usageTier: 'embed',
    costModel: 'free',
    durationSeconds: 480,
    ageBandFit: ['14-16'],
    readingLevel: null,
    difficulty: 'core',
    characterFitTags: ['gaming', 'coding'],
    qualityScore: 0.88,
    primary: true,
  },

  // --- tutorial --------------------------------------------------------------
  {
    slug: 'demo-algebra-expanding-brackets-tutorial',
    title: 'Expanding and Factorising Brackets',
    description: 'Guided practice with immediate worked answers.',
    mediaType: 'tutorial',
    provider: 'Demo Open Press',
    ...open(),
    ageBandFit: ['14-16'],
    readingLevel: 9,
    difficulty: 'core',
    characterFitTags: ['puzzles'],
    qualityScore: 0.9,
    primary: true,
  },
  {
    slug: 'demo-algebra-simultaneous-tutorial',
    title: 'Simultaneous Equations Without Fear',
    description: 'Elimination and substitution, one small step at a time.',
    mediaType: 'tutorial',
    provider: 'Demo Open Press',
    ...open('cc-by'),
    ageBandFit: ['14-16'],
    readingLevel: 8,
    difficulty: 'foundation',
    characterFitTags: ['puzzles', 'coding'],
    qualityScore: 0.84,
    primary: true,
  },
  {
    slug: 'demo-algebra-quadratics-tutorial',
    title: 'Solving Quadratics Four Ways',
    description: 'Factorising, completing the square, formula and graphing.',
    mediaType: 'tutorial',
    provider: 'Demo Academy',
    ...open(),
    ageBandFit: ['17-18'],
    readingLevel: 11,
    difficulty: 'stretch',
    characterFitTags: ['puzzles'],
    qualityScore: 0.87,
  },

  // --- reference -------------------------------------------------------------
  {
    slug: 'demo-algebra-identities-reference',
    title: 'Algebraic Identities Reference Card',
    description: 'One-page summary of the identities needed at KS4.',
    mediaType: 'reference',
    provider: 'Demo Open Press',
    ...open(),
    pageCount: 2,
    ageBandFit: ['14-16'],
    readingLevel: 9,
    difficulty: 'core',
    characterFitTags: [],
    qualityScore: 0.75,
    primary: true,
  },
  {
    slug: 'demo-algebra-graph-shapes-reference',
    title: 'Graph Shapes at a Glance',
    description: 'Visual reference for linear, quadratic and cubic graphs.',
    mediaType: 'reference',
    provider: 'Demo Academy',
    ...open('cc-by'),
    pageCount: 4,
    ageBandFit: ['14-16'],
    readingLevel: 7,
    difficulty: 'foundation',
    characterFitTags: ['art'],
    qualityScore: 0.81,
    primary: true,
  },
  {
    slug: 'demo-algebra-notation-reference',
    title: 'Notation and Vocabulary for Algebra',
    description: 'Plain-English glossary of algebraic notation.',
    mediaType: 'reference',
    provider: 'Demo Open Press',
    ...open(),
    pageCount: 6,
    ageBandFit: ['11-13'],
    readingLevel: 6,
    difficulty: 'foundation',
    characterFitTags: ['reading'],
    qualityScore: 0.7,
  },

  // --- book ------------------------------------------------------------------
  {
    slug: 'demo-algebra-foundations-book',
    title: 'Foundations of School Algebra',
    description: 'A full open textbook covering the KS4 algebra specification.',
    mediaType: 'book',
    provider: 'Demo Open Press',
    ...open('cc-by'),
    pageCount: 240,
    ageBandFit: ['14-16'],
    readingLevel: 9,
    difficulty: 'core',
    characterFitTags: ['reading'],
    qualityScore: 0.92,
    primary: true,
  },
  {
    slug: 'demo-algebra-history-book',
    title: 'A Short History of Algebra',
    description: 'How algebraic notation developed, for curious readers.',
    mediaType: 'book',
    provider: 'Demo Heritage Library',
    ...open('public-domain'),
    pageCount: 180,
    ageBandFit: ['17-18'],
    readingLevel: 12,
    difficulty: 'stretch',
    characterFitTags: ['history', 'reading'],
    qualityScore: 0.68,
  },
  {
    slug: 'demo-algebra-revision-guide-book',
    title: 'KS4 Algebra Revision Guide',
    description: 'Commercial revision guide with graded practice papers.',
    mediaType: 'book',
    provider: 'Demo Publisher',
    licence: 'proprietary',
    usageTier: 'commercial',
    costModel: 'paid',
    pageCount: 160,
    ageBandFit: ['14-16'],
    readingLevel: 9,
    difficulty: 'core',
    characterFitTags: [],
    qualityScore: 0.83,
    primary: true,
  },

  // --- audio -----------------------------------------------------------------
  {
    slug: 'demo-algebra-story-audio',
    title: 'The Unknown Quantity: An Algebra Story',
    description: 'A narrative introduction to variables as a radio play.',
    mediaType: 'audio',
    provider: 'Demo Audio Library',
    ...open('public-domain'),
    durationSeconds: 1500,
    ageBandFit: ['11-13'],
    readingLevel: null,
    difficulty: 'foundation',
    characterFitTags: ['theatre', 'reading'],
    qualityScore: 0.72,
  },
  {
    slug: 'demo-algebra-revision-podcast-audio',
    title: 'Algebra Revision Walkthrough',
    description: 'Spoken walkthrough of common exam questions.',
    mediaType: 'audio',
    provider: 'Demo Audio Library',
    ...open(),
    durationSeconds: 1200,
    ageBandFit: ['14-16'],
    readingLevel: null,
    difficulty: 'core',
    characterFitTags: ['music'],
    qualityScore: 0.74,
    primary: true,
  },
  {
    slug: 'demo-algebra-music-patterns-audio',
    title: 'Patterns, Rhythm and Sequences',
    description: 'Connects musical rhythm to arithmetic sequences.',
    mediaType: 'audio',
    provider: 'Demo Music Lab',
    ...open('cc-by'),
    durationSeconds: 900,
    ageBandFit: ['14-16'],
    readingLevel: null,
    difficulty: 'foundation',
    characterFitTags: ['music', 'dance'],
    qualityScore: 0.77,
  },

  // --- course ----------------------------------------------------------------
  {
    slug: 'demo-algebra-full-course',
    title: 'Complete KS4 Algebra Course',
    description: 'Twelve units with checkpoints, covering the whole topic.',
    mediaType: 'course',
    provider: 'Demo Academy',
    ...open(),
    durationSeconds: 43200,
    ageBandFit: ['14-16'],
    readingLevel: 9,
    difficulty: 'core',
    characterFitTags: ['puzzles'],
    qualityScore: 0.89,
    primary: true,
  },
  {
    slug: 'demo-algebra-robotics-course',
    title: 'Algebra Through Robotics',
    description: 'Builds equations from sensor readings and motor speeds.',
    mediaType: 'course',
    provider: 'Demo Code Club',
    ...open('cc-by'),
    durationSeconds: 21600,
    ageBandFit: ['14-16'],
    readingLevel: 8,
    difficulty: 'stretch',
    characterFitTags: ['robotics', 'coding'],
    qualityScore: 0.85,
  },
  {
    slug: 'demo-algebra-catchup-course',
    title: 'Algebra Catch-Up for Lower Secondary',
    description: 'Rebuilds confidence from first principles.',
    mediaType: 'course',
    provider: 'Demo Academy',
    ...open(),
    durationSeconds: 14400,
    ageBandFit: ['11-13'],
    readingLevel: 6,
    difficulty: 'foundation',
    characterFitTags: ['animals', 'baking'],
    qualityScore: 0.76,
  },
  {
    slug: 'demo-algebra-exam-clinic-course',
    title: 'Exam Clinic: Algebra Papers',
    description: 'Freemium course; graded papers behind a paywall.',
    mediaType: 'course',
    provider: 'Demo Publisher',
    licence: 'proprietary',
    usageTier: 'commercial',
    costModel: 'freemium',
    durationSeconds: 10800,
    ageBandFit: ['14-16'],
    readingLevel: 10,
    difficulty: 'stretch',
    characterFitTags: [],
    qualityScore: 0.8,
  },
];

const ATTRIBUTION_LICENCES = ['cc-by', 'cc-by-sa'];

export interface DemoSeedResult {
  readonly nodeSlug: string;
  readonly resources: number;
}

/**
 * Idempotent: resources are keyed on slug and enrichment on (resource_id, source), so a
 * re-run refreshes rather than duplicating.
 */
export async function seedDemoCatalog(
  db: NodePgDatabase<Record<string, unknown>>,
  nodeSlug = 'ks4-maths-algebra',
): Promise<DemoSeedResult> {
  const [node] = await db
    .select({ id: taxonomyNodes.id })
    .from(taxonomyNodes)
    .where(eq(taxonomyNodes.slug, nodeSlug))
    .limit(1);

  if (!node) {
    throw new Error(
      `Cannot seed demo data: taxonomy node "${nodeSlug}" is missing. Run the taxonomy seed first.`,
    );
  }

  const now = new Date();

  for (const demo of DEMO_RESOURCES) {
    const [row] = await db
      .insert(resources)
      .values({
        slug: demo.slug,
        title: demo.title,
        description: demo.description,
        canonicalUrl: `https://example.com/demo/${demo.slug}`,
        embedUrl:
          demo.usageTier === 'embed'
            ? `https://example.com/demo/embed/${demo.slug}`
            : null,
        affiliateUrl:
          demo.usageTier === 'commercial'
            ? `https://example.com/demo/go/${demo.slug}`
            : null,
        mediaType: demo.mediaType,
        provider: demo.provider,
        authors: [demo.provider],
        language: 'en-GB',
        licence: demo.licence,
        usageTier: demo.usageTier,
        attributionText: ATTRIBUTION_LICENCES.includes(demo.licence)
          ? `${demo.provider}, ${demo.licence.toUpperCase()}`
          : null,
        costModel: demo.costModel,
        durationSeconds: demo.durationSeconds ?? null,
        pageCount: demo.pageCount ?? null,
        sourceConnector: 'demo-seed',
        sourceTermsVerifiedAt: now,
        lastVerifiedAt: now,
        publishedAt: now,
      })
      .onConflictDoUpdate({
        target: resources.slug,
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          costModel: sql`excluded.cost_model`,
          publishedAt: sql`excluded.published_at`,
          lastVerifiedAt: sql`excluded.last_verified_at`,
        },
      })
      .returning({ id: resources.id });

    if (!row) {
      throw new Error(`Demo resource upsert returned no row for ${demo.slug}`);
    }

    await db
      .insert(resourceTaxonomy)
      .values({
        resourceId: row.id,
        nodeId: node.id,
        primary: demo.primary ?? false,
      })
      .onConflictDoNothing();

    await db
      .insert(resourceEnrichment)
      .values({
        resourceId: row.id,
        source: 'curated',
        ageBandFit: [...demo.ageBandFit],
        readingLevel: demo.readingLevel,
        difficulty: demo.difficulty,
        characterFitTags: [...demo.characterFitTags],
        qualityScore: demo.qualityScore.toFixed(2),
        summary: demo.description,
        safetyVetStatus: 'passed',
        vettedBy: VETTED_BY,
        vettedAt: now,
      })
      .onConflictDoUpdate({
        target: [resourceEnrichment.resourceId, resourceEnrichment.source],
        set: {
          ageBandFit: sql`excluded.age_band_fit`,
          readingLevel: sql`excluded.reading_level`,
          difficulty: sql`excluded.difficulty`,
          characterFitTags: sql`excluded.character_fit_tags`,
          qualityScore: sql`excluded.quality_score`,
          summary: sql`excluded.summary`,
          safetyVetStatus: sql`excluded.safety_vet_status`,
          vettedBy: sql`excluded.vetted_by`,
          vettedAt: sql`excluded.vetted_at`,
          enrichedAt: sql`now()`,
        },
      });
  }

  return { nodeSlug, resources: DEMO_RESOURCES.length };
}
