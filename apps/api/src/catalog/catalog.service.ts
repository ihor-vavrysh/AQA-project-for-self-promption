import { Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  like,
  or,
  sql,
} from 'drizzle-orm';
import {
  buildTaxonomyTree,
  checkUsageRights,
  isNodePublishable,
  retainPublishedWithAncestors,
  ResourceDetailSchema,
  ResourceListResponseSchema,
  TIER_CAPABILITIES,
  resolveOutboundUrl,
} from '@tutorforge/shared';
import type {
  LicenceCode,
  MediaType,
  ResourceDetail,
  ResourceListQuery,
  ResourceListResponse,
  TaxonomyNode,
  TaxonomyTreeNode,
  UsageRightsViolation,
  UsageTier,
} from '@tutorforge/shared';
import { DatabaseService } from '../database/database.service.js';
import {
  resourceTaxonomy,
  resources,
  taxonomyNodes,
} from '../database/schema.js';

export interface UsageRightsAuditEntry {
  readonly id: string;
  readonly slug: string;
  readonly violations: UsageRightsViolation[];
}

@Injectable()
export class CatalogService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * The whole tree, built in memory. The taxonomy is in the low hundreds of
   * nodes, so a single scan beats recursive SQL for both clarity and latency.
   */
  async getTaxonomyTree(options: {
    publishedOnly: boolean;
  }): Promise<TaxonomyTreeNode[]> {
    const rows = await this.database.db
      .select()
      .from(taxonomyNodes)
      .orderBy(asc(taxonomyNodes.depth), asc(taxonomyNodes.path));

    const nodes = rows.map((row) => this.toTaxonomyNode(row));
    return buildTaxonomyTree(
      options.publishedOnly ? retainPublishedWithAncestors(nodes) : nodes,
    );
  }

  async getNodeBySlug(slug: string): Promise<TaxonomyNode> {
    const [row] = await this.database.db
      .select()
      .from(taxonomyNodes)
      .where(eq(taxonomyNodes.slug, slug))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Unknown taxonomy node "${slug}"`);
    }
    return this.toTaxonomyNode(row);
  }

  async listResources(query: ResourceListQuery): Promise<ResourceListResponse> {
    const filters = [isNotNull(resources.publishedAt)];

    if (query.mediaType) {
      filters.push(eq(resources.mediaType, query.mediaType));
    }
    if (query.language) {
      filters.push(eq(resources.language, query.language));
    }
    if (query.costModel) {
      filters.push(eq(resources.costModel, query.costModel));
    }
    if (query.node) {
      // getNodeBySlug throws for an unknown slug, and a node always contains
      // itself, so this list is never empty.
      const nodeIds = await this.subtreeNodeIds(query.node);
      const scoped = this.database.db
        .select({ resourceId: resourceTaxonomy.resourceId })
        .from(resourceTaxonomy)
        .where(inArray(resourceTaxonomy.nodeId, nodeIds));
      filters.push(inArray(resources.id, scoped));
    }

    const where = and(...filters);

    const [items, totals, mediaTypeFacet, costModelFacet] = await Promise.all([
      this.database.db
        .select()
        .from(resources)
        .where(where)
        .orderBy(asc(resources.title))
        .limit(query.limit)
        .offset(query.offset),
      this.database.db.select({ value: count() }).from(resources).where(where),
      this.database.db
        .select({ key: resources.mediaType, value: count() })
        .from(resources)
        .where(where)
        .groupBy(resources.mediaType),
      this.database.db
        .select({ key: resources.costModel, value: count() })
        .from(resources)
        .where(where)
        .groupBy(resources.costModel),
    ]);

    return ResourceListResponseSchema.parse({
      items: items.map((row) => this.toResourceSummary(row)),
      total: Number(totals[0]?.value ?? 0),
      facets: {
        mediaType: this.toFacet(mediaTypeFacet),
        costModel: this.toFacet(costModelFacet),
      },
    });
  }

  async getResourceBySlug(slug: string): Promise<ResourceDetail> {
    const [row] = await this.database.db
      .select()
      .from(resources)
      .where(and(eq(resources.slug, slug), isNotNull(resources.publishedAt)))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Unknown resource "${slug}"`);
    }

    const usageTier = row.usageTier as UsageTier;
    const capabilities = TIER_CAPABILITIES[usageTier];

    return ResourceDetailSchema.parse({
      ...this.toResourceSummary(row),
      canonicalUrl: row.canonicalUrl,
      // Never expose an embed URL for a tier that may not be embedded, even if
      // one somehow reached the row.
      embedUrl: capabilities.embed ? row.embedUrl : null,
      outboundUrl: resolveOutboundUrl({
        usageTier,
        canonicalUrl: row.canonicalUrl,
        affiliateUrl: row.affiliateUrl,
      }),
      attributionText: row.attributionText,
      authors: row.authors,
      isbn: row.isbn,
      capabilities,
    });
  }

  /**
   * Every stored resource that breaks a usage-rights rule. The database CHECK
   * constraints should make this impossible; the blocking invariant test asserts
   * it is empty so a future migration cannot quietly weaken them.
   */
  async auditUsageRights(): Promise<UsageRightsAuditEntry[]> {
    const rows = await this.database.db
      .select({
        id: resources.id,
        slug: resources.slug,
        licence: resources.licence,
        usageTier: resources.usageTier,
        embedUrl: resources.embedUrl,
        mirroredPath: resources.mirroredPath,
        affiliateUrl: resources.affiliateUrl,
        attributionText: resources.attributionText,
      })
      .from(resources);

    return rows
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        violations: checkUsageRights({
          licence: row.licence as LicenceCode,
          usageTier: row.usageTier as UsageTier,
          embedUrl: row.embedUrl,
          mirroredPath: row.mirroredPath,
          affiliateUrl: row.affiliateUrl,
          attributionText: row.attributionText,
        }),
      }))
      .filter((entry) => entry.violations.length > 0);
  }

  /**
   * Recomputes the denormalised depth-gate counters over each node's subtree and
   * publishes or unpublishes nodes accordingly. Idempotent, so it can run after
   * any import.
   */
  async refreshDepthGate(): Promise<{
    published: number;
    unpublished: number;
  }> {
    const nodes = await this.database.db
      .select({
        id: taxonomyNodes.id,
        path: taxonomyNodes.path,
        publishedAt: taxonomyNodes.publishedAt,
      })
      .from(taxonomyNodes);

    let published = 0;
    let unpublished = 0;

    for (const node of nodes) {
      const [totals] = await this.database.db
        .select({
          resourceCount: count(),
          mediaTypeCount: sql<number>`count(distinct ${resources.mediaType})`,
        })
        .from(resources)
        .innerJoin(
          resourceTaxonomy,
          eq(resourceTaxonomy.resourceId, resources.id),
        )
        .innerJoin(taxonomyNodes, eq(taxonomyNodes.id, resourceTaxonomy.nodeId))
        .where(
          and(
            isNotNull(resources.publishedAt),
            or(
              eq(taxonomyNodes.path, node.path),
              like(taxonomyNodes.path, `${node.path}.%`),
            ),
          ),
        );

      const resourceCount = Number(totals?.resourceCount ?? 0);
      const mediaTypeCount = Number(totals?.mediaTypeCount ?? 0);
      const shouldPublish = isNodePublishable({
        resourceCount,
        mediaTypeCount,
      });

      if (shouldPublish) {
        published += 1;
      } else {
        unpublished += 1;
      }

      await this.database.db
        .update(taxonomyNodes)
        .set({
          resourceCount,
          mediaTypeCount,
          publishedAt: shouldPublish ? (node.publishedAt ?? new Date()) : null,
        })
        .where(eq(taxonomyNodes.id, node.id));
    }

    return { published, unpublished };
  }

  private async subtreeNodeIds(slug: string): Promise<string[]> {
    const node = await this.getNodeBySlug(slug);
    const rows = await this.database.db
      .select({ id: taxonomyNodes.id })
      .from(taxonomyNodes)
      .where(
        or(
          eq(taxonomyNodes.path, node.path),
          like(taxonomyNodes.path, `${node.path}.%`),
        ),
      );
    return rows.map((row) => row.id);
  }

  private toFacet(
    rows: readonly { key: string; value: number }[],
  ): Record<string, number> {
    return Object.fromEntries(rows.map((row) => [row.key, Number(row.value)]));
  }

  private toTaxonomyNode(row: typeof taxonomyNodes.$inferSelect): TaxonomyNode {
    return {
      id: row.id,
      parentId: row.parentId,
      scheme: row.scheme,
      code: row.code,
      slug: row.slug,
      path: row.path,
      depth: row.depth,
      names: row.names,
      resourceCount: row.resourceCount,
      mediaTypeCount: row.mediaTypeCount,
      published: row.publishedAt !== null,
    };
  }

  private toResourceSummary(row: typeof resources.$inferSelect) {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      mediaType: row.mediaType as MediaType,
      provider: row.provider,
      language: row.language,
      licence: row.licence as LicenceCode,
      usageTier: row.usageTier as UsageTier,
      costModel: row.costModel,
      durationSeconds: row.durationSeconds,
      pageCount: row.pageCount,
      lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    };
  }
}
