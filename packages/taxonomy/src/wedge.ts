import type { TaxonomySeedNode } from './types.js';

/**
 * The lit wedge from docs/CATALOG.md §1.4: UK Key Stage 3 and 4 mathematics and
 * the three sciences. These are the only nodes expected to pass the depth gate
 * in Phase 2a; every other node in the tree stays unpublished.
 *
 * Key stage is part of the topic rather than a tree level of its own, so the
 * subject tree is not duplicated per key stage and URLs stay readable.
 */
type KeyStage = 'ks3' | 'ks4';

const topics = (
  keyStage: KeyStage,
  parentSubject: string,
  entries: readonly (readonly [slug: string, en: string])[],
): readonly TaxonomySeedNode[] =>
  entries.map(([slug, en]) => {
    const code = `${keyStage}-${parentSubject}-${slug}`;
    return {
      scheme: 'internal' as const,
      code,
      slug: code,
      parent: `uk-nc:${parentSubject}`,
      names: { en: `${en} (${keyStage.toUpperCase()})` },
    };
  });

export const wedgeTopicNodes: readonly TaxonomySeedNode[] = [
  ...topics('ks3', 'maths', [
    ['number', 'Number'],
    ['algebra', 'Algebra'],
    ['ratio-proportion', 'Ratio, proportion and rates of change'],
    ['geometry-measures', 'Geometry and measures'],
    ['probability', 'Probability'],
    ['statistics', 'Statistics'],
  ]),
  ...topics('ks4', 'maths', [
    ['number', 'Number'],
    ['algebra', 'Algebra'],
    ['ratio-proportion', 'Ratio, proportion and rates of change'],
    ['geometry-measures', 'Geometry and measures'],
    ['trigonometry', 'Trigonometry'],
    ['probability', 'Probability'],
    ['statistics', 'Statistics'],
  ]),
  ...topics('ks3', 'biology', [
    ['cells-organisation', 'Cells and organisation'],
    ['nutrition-digestion', 'Nutrition and digestion'],
    ['respiration', 'Respiration'],
    ['photosynthesis', 'Photosynthesis'],
    ['reproduction', 'Reproduction'],
    ['genetics-evolution', 'Genetics and evolution'],
    ['ecosystems', 'Ecosystems and interdependence'],
  ]),
  ...topics('ks4', 'biology', [
    ['cell-biology', 'Cell biology'],
    ['organisation', 'Organisation'],
    ['infection-response', 'Infection and response'],
    ['bioenergetics', 'Bioenergetics'],
    ['homeostasis-response', 'Homeostasis and response'],
    ['inheritance-variation-evolution', 'Inheritance, variation and evolution'],
    ['ecology', 'Ecology'],
  ]),
  ...topics('ks3', 'chemistry', [
    ['particle-model', 'The particle model'],
    ['atoms-elements-compounds', 'Atoms, elements and compounds'],
    ['chemical-reactions', 'Chemical reactions'],
    ['acids-alkalis', 'Acids and alkalis'],
    ['periodic-table', 'The periodic table'],
    ['earth-atmosphere', 'Earth and atmosphere'],
  ]),
  ...topics('ks4', 'chemistry', [
    [
      'atomic-structure-periodic-table',
      'Atomic structure and the periodic table',
    ],
    ['bonding-structure', 'Bonding, structure and properties of matter'],
    ['quantitative-chemistry', 'Quantitative chemistry'],
    ['chemical-changes', 'Chemical changes'],
    ['energy-changes', 'Energy changes'],
    ['rates-equilibrium', 'Rate and extent of chemical change'],
    ['organic-chemistry', 'Organic chemistry'],
    ['chemical-analysis', 'Chemical analysis'],
    ['atmosphere', 'Chemistry of the atmosphere'],
    ['using-resources', 'Using resources'],
  ]),
  ...topics('ks3', 'physics', [
    ['forces', 'Forces'],
    ['energy', 'Energy'],
    ['motion', 'Motion'],
    ['waves', 'Waves'],
    ['electricity-magnetism', 'Electricity and magnetism'],
    ['matter', 'Matter'],
    ['space-physics', 'Space physics'],
  ]),
  ...topics('ks4', 'physics', [
    ['energy', 'Energy'],
    ['electricity', 'Electricity'],
    ['particle-model', 'Particle model of matter'],
    ['atomic-structure', 'Atomic structure'],
    ['forces', 'Forces'],
    ['waves', 'Waves'],
    ['magnetism-electromagnetism', 'Magnetism and electromagnetism'],
  ]),
];
