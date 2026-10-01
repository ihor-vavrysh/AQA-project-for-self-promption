import type { TaxonomySeedNode } from './types.js';

/**
 * UK National Curriculum subjects — the school-subject spine from
 * docs/CATALOG.md §2, covering the primary and lower-secondary range that
 * ISCED-F does not address.
 *
 * Each subject hangs beneath the ISCED-F field it belongs to, so the two
 * schemes form one navigable tree rather than two disconnected ones.
 */
const subject = (
  code: string,
  en: string,
  parent: string,
): TaxonomySeedNode => ({
  scheme: 'uk-nc',
  code,
  slug: code,
  parent,
  names: { en },
});

export const ukNationalCurriculumNodes: readonly TaxonomySeedNode[] = [
  subject('maths', 'Mathematics', 'isced-f:054'),
  subject('english', 'English', 'isced-f:023'),
  subject('science', 'Science', 'isced-f:05'),
  subject('biology', 'Biology', 'uk-nc:science'),
  subject('chemistry', 'Chemistry', 'uk-nc:science'),
  subject('physics', 'Physics', 'uk-nc:science'),
  subject('computing', 'Computing', 'isced-f:061'),
  subject('history', 'History', 'isced-f:022'),
  subject('geography', 'Geography', 'isced-f:022'),
  subject('religious-education', 'Religious education', 'isced-f:022'),
  subject('art-and-design', 'Art and design', 'isced-f:021'),
  subject('music', 'Music', 'isced-f:021'),
  subject('design-and-technology', 'Design and technology', 'isced-f:071'),
  subject(
    'modern-foreign-languages',
    'Modern foreign languages',
    'isced-f:023',
  ),
  subject('citizenship', 'Citizenship', 'isced-f:031'),
  subject('physical-education', 'Physical education', 'isced-f:101'),
];
