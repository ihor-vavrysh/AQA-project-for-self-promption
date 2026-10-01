import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  COST_MODELS,
  MEDIA_TYPES,
  ResourceListQuerySchema,
  TopicDemandRequestSchema,
} from '@tutorforge/shared';
import type {
  ResourceDetail,
  ResourceListResponse,
  TaxonomyNode,
  TaxonomyTreeNode,
} from '@tutorforge/shared';
import { Public } from '../auth/public.decorator.js';
import {
  ResourceDetailDto,
  ResourceListDto,
  TaxonomyNodeDto,
  TaxonomyTreeNodeDto,
  TopicDemandEventDto,
  TopicDemandSummaryDto,
} from './catalog.dto.js';
import { CatalogService } from './catalog.service.js';

/**
 * The catalog is a public acquisition surface (docs/CATALOG.md §5), so these
 * endpoints are unauthenticated. Assignment to a learner is a tutor action and
 * lives behind authentication in a later slice.
 */
@ApiTags('catalog')
@Controller('api/v1/catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('taxonomy')
  @ApiOperation({
    summary: 'Browse the subject taxonomy',
    description:
      'Returns the tree. By default only nodes that pass the depth gate are included, along with the ancestors needed to reach them.',
  })
  @ApiQuery({
    name: 'includeUnpublished',
    required: false,
    type: Boolean,
    description: 'Include nodes that have not yet passed the depth gate',
  })
  @ApiOkResponse({ type: [TaxonomyTreeNodeDto] })
  getTaxonomy(
    @Query('includeUnpublished') includeUnpublished?: string,
  ): Promise<TaxonomyTreeNode[]> {
    return this.catalog.getTaxonomyTree({
      publishedOnly: includeUnpublished !== 'true',
    });
  }

  @Public()
  @Get('nodes/:slug')
  @ApiOperation({ summary: 'Get one taxonomy node' })
  @ApiOkResponse({ type: TaxonomyNodeDto })
  @ApiNotFoundResponse({ description: 'No node with that slug' })
  getNode(@Param('slug') slug: string): Promise<TaxonomyNode> {
    return this.catalog.getNodeBySlug(slug);
  }

  @Public()
  @Get('resources')
  @ApiOperation({
    summary: 'List published resources with facet counts',
    description:
      'Filtering by node includes the whole subtree beneath it. Only published resources are returned.',
  })
  @ApiQuery({ name: 'node', required: false, type: String })
  @ApiQuery({ name: 'mediaType', required: false, enum: MEDIA_TYPES })
  @ApiQuery({ name: 'language', required: false, type: String })
  @ApiQuery({ name: 'costModel', required: false, enum: COST_MODELS })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiOkResponse({ type: ResourceListDto })
  listResources(
    @Query() query: Record<string, string>,
  ): Promise<ResourceListResponse> {
    return this.catalog.listResources(ResourceListQuerySchema.parse(query));
  }

  @Public()
  @Get('resources/:slug')
  @ApiOperation({ summary: 'Get one published resource' })
  @ApiOkResponse({ type: ResourceDetailDto })
  @ApiNotFoundResponse({ description: 'No published resource with that slug' })
  getResource(@Param('slug') slug: string): Promise<ResourceDetail> {
    return this.catalog.getResourceBySlug(slug);
  }

  @Public()
  @Get('demand')
  @ApiOperation({
    summary: 'List the most-requested uncovered topics',
    description:
      'Returns aggregate topic demand, sorted by total requests so the product can prioritise what to publish next.',
  })
  @ApiOkResponse({ type: [TopicDemandSummaryDto] })
  listDemand(): Promise<
    Array<{ slug: string; count: number; requestedBy: string | null; requestedAt: string }>
  > {
    return this.catalog.listTopicDemand();
  }

  @Public()
  @Post('nodes/:slug/request')
  @ApiOperation({
    summary: 'Register a request for a topic that is not yet covered',
    description:
      'Tracks demand for a taxonomy node so the product can decide where to light the next content wedge.',
  })
  @ApiCreatedResponse({ type: TopicDemandEventDto })
  @ApiNotFoundResponse({ description: 'No node with that slug' })
  registerTopicDemand(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown> = {},
  ): Promise<{
    nodeSlug: string;
    requestedBy: string;
    requestedAt: string;
    count: number;
  }> {
    const payload = TopicDemandRequestSchema.parse(body);
    return this.catalog.recordTopicDemand(slug, payload.requestedBy);
  }
}
