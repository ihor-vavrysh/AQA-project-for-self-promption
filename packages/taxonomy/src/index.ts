import { iscedFieldNodes } from './isced-f.js';
import { ukNationalCurriculumNodes } from './uk-nc.js';
import { wedgeTopicNodes } from './wedge.js';
import { nodeKey } from './types.js';
import type { ResolvedTaxonomyNode, TaxonomySeedNode } from './types.js';

export * from './types.js';
export { iscedFieldNodes } from './isced-f.js';
export { ukNationalCurriculumNodes } from './uk-nc.js';
export { wedgeTopicNodes } from './wedge.js';

/** The complete seed tree: ISCED-F fields, UK subjects, and wedge topics. */
export const taxonomySeedNodes: readonly TaxonomySeedNode[] = [
  ...iscedFieldNodes,
  ...ukNationalCurriculumNodes,
  ...wedgeTopicNodes,
];

export class TaxonomySeedError extends Error {}

/**
 * Validates the seed and resolves each node's depth and materialised path.
 *
 * Returns nodes in insertion-safe order: a parent always precedes its children,
 * so the result can be written straight to the database without deferring
 * foreign keys.
 */
export function resolveTaxonomySeed(
  nodes: readonly TaxonomySeedNode[] = taxonomySeedNodes,
): ResolvedTaxonomyNode[] {
  const byKey = new Map<string, TaxonomySeedNode>();
  const seenSlugs = new Map<string, string>();

  for (const node of nodes) {
    const key = nodeKey(node);
    if (byKey.has(key)) {
      throw new TaxonomySeedError(`duplicate taxonomy node: ${key}`);
    }
    const slugOwner = seenSlugs.get(node.slug);
    if (slugOwner) {
      throw new TaxonomySeedError(
        `duplicate slug "${node.slug}" used by ${slugOwner} and ${key}`,
      );
    }
    if (!node.names.en?.trim()) {
      throw new TaxonomySeedError(`node ${key} is missing an English label`);
    }
    byKey.set(key, node);
    seenSlugs.set(node.slug, key);
  }

  const resolved = new Map<string, ResolvedTaxonomyNode>();
  const resolving = new Set<string>();

  const resolve = (key: string): ResolvedTaxonomyNode => {
    const existing = resolved.get(key);
    if (existing) {
      return existing;
    }
    if (resolving.has(key)) {
      throw new TaxonomySeedError(`taxonomy cycle involving ${key}`);
    }
    const node = byKey.get(key);
    if (!node) {
      throw new TaxonomySeedError(`unknown parent reference: ${key}`);
    }

    resolving.add(key);
    let depth = 0;
    let path = node.code;
    if (node.parent !== null) {
      const parent = resolve(node.parent);
      depth = parent.depth + 1;
      path = `${parent.path}.${node.code}`;
    }
    resolving.delete(key);

    const entry: ResolvedTaxonomyNode = { ...node, key, depth, path };
    resolved.set(key, entry);
    return entry;
  };

  for (const node of nodes) {
    resolve(nodeKey(node));
  }

  // Depth order guarantees parents are written before their children.
  return [...resolved.values()].sort(
    (a, b) => a.depth - b.depth || a.path.localeCompare(b.path),
  );
}
