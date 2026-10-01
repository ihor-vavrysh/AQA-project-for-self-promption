import type { TaxonomySeedNode } from './types.js';

/**
 * ISCED-F 2013 (UNESCO Institute for Statistics): 11 broad fields and their 29
 * narrow fields. This is the fields spine from docs/CATALOG.md §2 — the full
 * tree is seeded even though only the wedge is populated with resources.
 *
 * ISCED-F is scoped to secondary, post-secondary and tertiary education, so it
 * is deliberately paired with a school-subject scheme (see uk-nc.ts) rather than
 * stretched to cover primary education.
 */
const broad = (code: string, slug: string, en: string): TaxonomySeedNode => ({
  scheme: 'isced-f',
  code,
  slug,
  parent: null,
  names: { en },
});

const narrow = (code: string, slug: string, en: string): TaxonomySeedNode => ({
  scheme: 'isced-f',
  code,
  slug,
  parent: `isced-f:${code.slice(0, 2)}`,
  names: { en },
});

export const iscedFieldNodes: readonly TaxonomySeedNode[] = [
  broad('00', 'generic-programmes', 'Generic programmes and qualifications'),
  narrow('001', 'basic-programmes', 'Basic programmes and qualifications'),
  narrow('002', 'literacy-and-numeracy', 'Literacy and numeracy'),
  narrow(
    '003',
    'personal-skills-and-development',
    'Personal skills and development',
  ),

  broad('01', 'education', 'Education'),
  narrow('011', 'education-studies', 'Education'),

  broad('02', 'arts-and-humanities', 'Arts and humanities'),
  narrow('021', 'arts', 'Arts'),
  narrow('022', 'humanities', 'Humanities (except languages)'),
  narrow('023', 'languages', 'Languages'),

  broad(
    '03',
    'social-sciences-journalism-information',
    'Social sciences, journalism and information',
  ),
  narrow(
    '031',
    'social-and-behavioural-sciences',
    'Social and behavioural sciences',
  ),
  narrow('032', 'journalism-and-information', 'Journalism and information'),

  broad(
    '04',
    'business-administration-law',
    'Business, administration and law',
  ),
  narrow('041', 'business-and-administration', 'Business and administration'),
  narrow('042', 'law', 'Law'),

  broad(
    '05',
    'natural-sciences-mathematics-statistics',
    'Natural sciences, mathematics and statistics',
  ),
  narrow('051', 'biological-sciences', 'Biological and related sciences'),
  narrow('052', 'environment', 'Environment'),
  narrow('053', 'physical-sciences', 'Physical sciences'),
  narrow('054', 'mathematics-and-statistics', 'Mathematics and statistics'),

  broad(
    '06',
    'information-and-communication-technologies',
    'Information and Communication Technologies',
  ),
  narrow('061', 'ict', 'Information and Communication Technologies (ICTs)'),

  broad(
    '07',
    'engineering-manufacturing-construction',
    'Engineering, manufacturing and construction',
  ),
  narrow(
    '071',
    'engineering-and-engineering-trades',
    'Engineering and engineering trades',
  ),
  narrow('072', 'manufacturing-and-processing', 'Manufacturing and processing'),
  narrow(
    '073',
    'architecture-and-construction',
    'Architecture and construction',
  ),

  broad(
    '08',
    'agriculture-forestry-fisheries-veterinary',
    'Agriculture, forestry, fisheries and veterinary',
  ),
  narrow('081', 'agriculture', 'Agriculture'),
  narrow('082', 'forestry', 'Forestry'),
  narrow('083', 'fisheries', 'Fisheries'),
  narrow('084', 'veterinary', 'Veterinary'),

  broad('09', 'health-and-welfare', 'Health and welfare'),
  narrow('091', 'health', 'Health'),
  narrow('092', 'welfare', 'Welfare'),

  broad('10', 'services', 'Services'),
  narrow('101', 'personal-services', 'Personal services'),
  narrow(
    '102',
    'hygiene-and-occupational-health',
    'Hygiene and occupational health services',
  ),
  narrow('103', 'security-services', 'Security services'),
  narrow('104', 'transport-services', 'Transport services'),
];
