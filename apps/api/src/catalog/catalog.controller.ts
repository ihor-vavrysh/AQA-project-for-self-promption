import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  COST_MODELS,
  LearnerContextSchema,
  MEDIA_TYPES,
  ResourceListQuerySchema,
} from '@tutorforge/shared';
import type {
  ResourceDetail,
  ResourceListResponse,
  SuggestionListResponse,
  TaxonomyNode,
  TaxonomyTreeNode,
} from '@tutorforge/shared';
import { Public } from '../auth/public.decorator.js';
import {
  LearnerContextDto,
  ResourceDetailDto,
  ResourceListDto,
  SuggestionListDto,
  TaxonomyNodeDto,
  TaxonomyTreeNodeDto,
} from './catalog.dto.js';
import { CatalogService } from './catalog.service.js';
import { SuggestionsService } from './suggestions.service.js';

/**
 * The catalog is a public acquisition surface (docs/CATALOG.md §5), so these
 * endpoints are unauthenticated. Assignment to a learner is a tutor action and
 * lives behind authentication in a later slice.
 */
@ApiTags('catalog')
@Controller('api/v1/catalog')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly suggestions: SuggestionsService,
  ) {}

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

  /**
   * POST for a read, deliberately. The body carries a coarse profile of a child, and a
   * query string would put it in access logs, CDN cache keys, browser history and the
   * Referer of every outbound click from the results.
   */
  @Public()
  @Post('suggestions')
  // A read, despite the verb, so 200 rather than 201.
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({
    summary: 'Suggest existing catalog resources for a learner',
    description:
      'Deterministic ranking with per-suggestion reasons. Age-band fit gates the score; cost can only count against a resource. Gender is not accepted and cannot influence ranking.',
  })
  @ApiBody({ type: LearnerContextDto })
  @ApiOkResponse({ type: SuggestionListDto })
  @ApiBadRequestResponse({ description: 'The learner context is invalid' })
  @ApiNotFoundResponse({ description: 'No taxonomy node with that slug' })
  suggest(
    @Body() body: Record<string, unknown>,
  ): Promise<SuggestionListResponse> {
    const parsed = LearnerContextSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    return this.suggestions.suggest(parsed.data);
  }
}
