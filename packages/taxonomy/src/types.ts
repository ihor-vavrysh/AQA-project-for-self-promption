import type { TaxonomyScheme } from '@tutorforge/shared';

/**
 * A node as authored in the seed data. `parent` references another node by
 * `"<scheme>:<code>"`, which lets one scheme hang beneath another — the UK
 * National Curriculum subjects sit under their ISCED-F fields rather than
 * forming a second disconnected tree.
 */
export interface TaxonomySeedNode {
  readonly scheme: TaxonomyScheme;
  readonly code: string;
  readonly slug: string;
  readonly parent: string | null;
  readonly names: Readonly<Record<string, string>>;
}

/** A seed node with its position in the tree resolved. */
export interface ResolvedTaxonomyNode extends TaxonomySeedNode {
  readonly key: string;
  readonly depth: number;
  /** Dot-separated codes from the root, used for subtree prefix queries. */
  readonly path: string;
}

export const nodeKey = (
  node: Pick<TaxonomySeedNode, 'scheme' | 'code'>,
): string => `${node.scheme}:${node.code}`;
