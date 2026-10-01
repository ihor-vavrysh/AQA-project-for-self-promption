import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, like, ne, or, sql } from 'drizzle-orm';
import {
  MEDIA_TYPES,
  SUGGESTION_WEIGHTS_VERSION,
  SuggestionListResponseSchema,
  checkEnrichmentProvenance,
  rankSuggestions,
} from '@tutorforge/shared';
import type {
  AgeBand,
  CharacterFitTag,
  DifficultyBand,
  EnrichmentSource,
  LearnerContext,
  LicenceCode,
  MediaType,
  SafetyVetStatus,
  SuggestionCandidate,
  SuggestionEmptyCause,
  SuggestionListResponse,
  TopicMatch,
  UsageTier,
} from '@tutorforge/shared';
import { DatabaseService } from '../database/database.service.js';
import {
  resourceEnrichment,
  resourceEnrichmentCurrent,
  resourceTaxonomy,
  resources,
  taxonomyNodes,
} from '../database/schema.js';
import { CatalogService } from './catalog.service.js';

/**
 * Per media type, so the diversity caps have a mixed pool to work with. A single global
 * limit ordered by quality can return nothing but videos, after which no re-rank can
 * produce a mixed list.
 */
const CANDIDATES_PER_MEDIA_TYPE = 40;

export interface EnrichmentProvenanceAuditEntry {
  readonly resourceId: string;
  readonly source: EnrichmentSource;
  readonly violations: string[];
}

@Injectable()
export class SuggestionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly catalog: CatalogService,
  ) {}

  async suggest(context: LearnerContext): Promise<SuggestionListResponse> {
    const nodeIds = await this.relevantNodeIds(context.node);
    const candidates = await this.loadCandidates(nodeIds, context);
    const items = rankSuggestions(candidates, context);

    return SuggestionListResponseSchema.parse({
      items,
      weightsVersion: SUGGESTION_WEIGHTS_VERSION,
      candidatesConsidered: candidates.length,
      emptyCause:
        items.length > 0
          ? null
          : await this.diagnoseEmpty(nodeIds, context, candidates.length),
    });
  }

  /**
   * The requested node, its whole subtree, **and its ancestor chain**. A strong general
   * "Algebra" resource is attached to the parent subject, not to the leaf topic, so a
   * descendant-only scan would never surface it.
   */
  private async relevantNodeIds(slug: string): Promise<string[]> {
    const node = await this.catalog.getNodeBySlug(slug);
    const segments = node.path.split('.');
    const ancestorPaths = segments
      .slice(0, -1)
      .map((_, index) => segments.slice(0, index + 1).join('.'));

    const rows = await this.database.db
      .select({ id: taxonomyNodes.id })
      .from(taxonomyNodes)
      .where(
        or(
          eq(taxonomyNodes.path, node.path),
          like(taxonomyNodes.path, `${node.path}.%`),
          ancestorPaths.length > 0
            ? inArray(taxonomyNodes.path, ancestorPaths)
            : undefined,
        ),
      );

    return rows.map((row) => row.id);
  }

  private scopedResourceIds(nodeIds: string[]) {
    return this.database.db
      .select({ resourceId: resourceTaxonomy.resourceId })
      .from(resourceTaxonomy)
      .where(inArray(resourceTaxonomy.nodeId, nodeIds));
  }

  /**
   * Hard filters live here rather than in the scorer: a resource that is unpublished,
   * unvetted, unaffordable or in the wrong language is not a low-scoring suggestion, it
   * is not a suggestion at all.
   */
  private baseFilters(nodeIds: string[], context: LearnerContext) {
    const filters = [
      isNotNull(resources.publishedAt),
      inArray(resources.id, this.scopedResourceIds(nodeIds)),
      // docs/CATALOG.md §4.1 — nothing unvetted reaches a learner, and four of the five
      // age bands are under 16.
      eq(resourceEnrichmentCurrent.safetyVetStatus, 'passed'),
      sql`split_part(${resources.language}, '-', 1) = split_part(${context.locale}, '-', 1)`,
    ];

    if (!context.allowPaid) {
      filters.push(ne(resources.costModel, 'paid'));
    }

    return and(...filters);
  }

  private async loadCandidates(
    nodeIds: string[],
    context: LearnerContext,
  ): Promise<SuggestionCandidate[]> {
    if (nodeIds.length === 0) {
      return [];
    }

    const perMediaType = await Promise.all(
      MEDIA_TYPES.map((mediaType) =>
        this.database.db
          .select({
            id: resources.id,
            slug: resources.slug,
            title: resources.title,
            description: resources.description,
            mediaType: resources.mediaType,
            provider: resources.provider,
            language: resources.language,
            licence: resources.licence,
            usageTier: resources.usageTier,
            costModel: resources.costModel,
            durationSeconds: resources.durationSeconds,
            pageCount: resources.pageCount,
            lastVerifiedAt: resources.lastVerifiedAt,
            ageBandFit: resourceEnrichmentCurrent.ageBandFit,
            readingLevel: resourceEnrichmentCurrent.readingLevel,
            difficulty: resourceEnrichmentCurrent.difficulty,
            characterFitTags: resourceEnrichmentCurrent.characterFitTags,
            qualityScore: resourceEnrichmentCurrent.qualityScore,
            enrichmentSource: resourceEnrichmentCurrent.source,
          })
          .from(resources)
          // Inner join: a resource with no enrichment has no personalization signal, so
          // it is excluded rather than scored as if every signal were zero.
          .innerJoin(
            resourceEnrichmentCurrent,
            eq(resourceEnrichmentCurrent.resourceId, resources.id),
          )
          .where(
            and(
              this.baseFilters(nodeIds, context),
              eq(resources.mediaType, mediaType),
            ),
          )
          .limit(CANDIDATES_PER_MEDIA_TYPE),
      ),
    );

    const rows = perMediaType.flat();
    const topicMatches = await this.resolveTopicMatches(
      rows.map((row) => row.id),
      context.node,
    );

    return rows.map((row) => ({
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
      topicMatch: topicMatches.get(row.id) ?? 'none',
      ageBandFit: row.ageBandFit as AgeBand[],
      readingLevel: row.readingLevel,
      difficulty: (row.difficulty as DifficultyBand | null) ?? null,
      characterFitTags: row.characterFitTags as CharacterFitTag[],
      qualityScore: row.qualityScore === null ? null : Number(row.qualityScore),
      enrichmentSource: row.enrichmentSource as EnrichmentSource,
    }));
  }

  /**
   * Best topic match per resource. Fetched separately rather than joined into the
   * candidate query: a resource linked to several nodes would otherwise appear once per
   * link and be counted twice in the suggestion list.
   */
  private async resolveTopicMatches(
    resourceIds: string[],
    slug: string,
  ): Promise<Map<string, TopicMatch>> {
    const matches = new Map<string, TopicMatch>();
    if (resourceIds.length === 0) {
      return matches;
    }

    const requested = await this.catalog.getNodeBySlug(slug);
    const links = await this.database.db
      .select({
        resourceId: resourceTaxonomy.resourceId,
        primary: resourceTaxonomy.primary,
        path: taxonomyNodes.path,
      })
      .from(resourceTaxonomy)
      .innerJoin(taxonomyNodes, eq(taxonomyNodes.id, resourceTaxonomy.nodeId))
      .where(inArray(resourceTaxonomy.resourceId, resourceIds));

    const rank: Record<TopicMatch, number> = {
      primary: 3,
      related: 2,
      ancestor: 1,
      none: 0,
    };

    for (const link of links) {
      let match: TopicMatch = 'none';

      if (link.path === requested.path) {
        match = link.primary ? 'primary' : 'related';
      } else if (link.path.startsWith(`${requested.path}.`)) {
        match = 'related';
      } else if (requested.path.startsWith(`${link.path}.`)) {
        match = 'ancestor';
      }

      const existing = matches.get(link.resourceId) ?? 'none';
      if (rank[match] > rank[existing]) {
        matches.set(link.resourceId, match);
      }
    }

    return matches;
  }

  /**
   * An unexplained empty list is a recommender's worst failure mode. Only runs when
   * there is nothing to show, peeling back one filter at a time to name the cause.
   */
  private async diagnoseEmpty(
    nodeIds: string[],
    context: LearnerContext,
    candidateCount: number,
  ): Promise<SuggestionEmptyCause> {
    if (candidateCount > 0) {
      return 'all-suppressed-by-age-gate';
    }
    if (nodeIds.length === 0) {
      return 'no-candidates-in-subtree';
    }

    const countWhere = async (
      where: ReturnType<typeof and>,
    ): Promise<number> => {
      const [row] = await this.database.db
        .select({ value: sql<number>`count(*)::int` })
        .from(resources)
        .leftJoin(
          resourceEnrichmentCurrent,
          eq(resourceEnrichmentCurrent.resourceId, resources.id),
        )
        .where(where);
      return row?.value ?? 0;
    };

    const inScope = and(
      isNotNull(resources.publishedAt),
      inArray(resources.id, this.scopedResourceIds(nodeIds)),
    );

    if ((await countWhere(inScope)) === 0) {
      return 'no-candidates-in-subtree';
    }
    if (
      (await countWhere(
        and(inScope, isNotNull(resourceEnrichmentCurrent.resourceId)),
      )) === 0
    ) {
      return 'all-filtered-by-missing-enrichment';
    }
    if (
      (await countWhere(
        and(inScope, eq(resourceEnrichmentCurrent.safetyVetStatus, 'passed')),
      )) === 0
    ) {
      return 'all-filtered-by-safety-vetting';
    }
    if (
      (await countWhere(
        and(
          inScope,
          eq(resourceEnrichmentCurrent.safetyVetStatus, 'passed'),
          sql`split_part(${resources.language}, '-', 1) = split_part(${context.locale}, '-', 1)`,
        ),
      )) === 0
    ) {
      return 'all-filtered-by-language';
    }
    return 'all-filtered-by-cost';
  }

  /**
   * Every enrichment row whose provenance or vetting breaks a rule. The CHECK
   * constraints should make this impossible; the blocking test asserts it is empty so a
   * future migration cannot quietly weaken them. Sibling of `auditUsageRights`.
   */
  async auditEnrichmentProvenance(): Promise<EnrichmentProvenanceAuditEntry[]> {
    const rows = await this.database.db
      .select({
        resourceId: resourceEnrichment.resourceId,
        source: resourceEnrichment.source,
        promptVersion: resourceEnrichment.promptVersion,
        model: resourceEnrichment.model,
        safetyVetStatus: resourceEnrichment.safetyVetStatus,
        vettedBy: resourceEnrichment.vettedBy,
      })
      .from(resourceEnrichment);

    return rows
      .map((row) => ({
        resourceId: row.resourceId,
        source: row.source as EnrichmentSource,
        violations: checkEnrichmentProvenance({
          source: row.source as EnrichmentSource,
          promptVersion: row.promptVersion,
          model: row.model,
          safetyVetStatus: row.safetyVetStatus as SafetyVetStatus,
          vettedBy: row.vettedBy,
        }) as string[],
      }))
      .filter((entry) => entry.violations.length > 0);
  }
}
