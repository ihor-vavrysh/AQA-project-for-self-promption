import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { resolveTaxonomySeed } from '@tutorforge/taxonomy';
import { taxonomyNodes } from '../database/schema.js';

export interface TaxonomySeedResult {
  readonly nodes: number;
}

/**
 * Loads the taxonomy spine from @tutorforge/taxonomy.
 *
 * Idempotent: nodes are keyed on (scheme, code), so re-running updates labels
 * and tree positions without duplicating rows. Resolved depth order guarantees
 * a parent exists before its children reference it.
 */
export async function seedTaxonomy(
  db: NodePgDatabase<Record<string, unknown>>,
): Promise<TaxonomySeedResult> {
  const resolved = resolveTaxonomySeed();
  const idByKey = new Map<string, string>();

  for (const node of resolved) {
    const parentId = node.parent ? idByKey.get(node.parent) : null;
    if (node.parent && !parentId) {
      throw new Error(
        `taxonomy seed resolved out of order: ${node.key} before ${node.parent}`,
      );
    }

    const [row] = await db
      .insert(taxonomyNodes)
      .values({
        scheme: node.scheme,
        code: node.code,
        slug: node.slug,
        path: node.path,
        depth: node.depth,
        names: node.names as Record<string, string>,
        parentId: parentId ?? null,
      })
      .onConflictDoUpdate({
        target: [taxonomyNodes.scheme, taxonomyNodes.code],
        set: {
          slug: sql`excluded.slug`,
          path: sql`excluded.path`,
          depth: sql`excluded.depth`,
          names: sql`excluded.names`,
          parentId: sql`excluded.parent_id`,
        },
      })
      .returning({ id: taxonomyNodes.id });

    if (!row) {
      throw new Error(`taxonomy upsert returned no row for ${node.key}`);
    }
    idByKey.set(node.key, row.id);
  }

  return { nodes: resolved.length };
}
