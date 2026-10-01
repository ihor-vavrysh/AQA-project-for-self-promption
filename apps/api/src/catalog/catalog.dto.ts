import { ApiProperty } from '@nestjs/swagger';
import {
  COST_MODELS,
  LICENCE_CODES,
  MEDIA_TYPES,
  TAXONOMY_SCHEMES,
  USAGE_TIERS,
} from '@tutorforge/shared';

export class TaxonomyNodeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  parentId!: string | null;
  @ApiProperty({ enum: TAXONOMY_SCHEMES }) scheme!: string;
  @ApiProperty() code!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ description: 'Dot-separated node codes from the root' })
  path!: string;
  @ApiProperty() depth!: number;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Localised labels keyed by language tag; "en" is required',
  })
  names!: Record<string, string>;
  @ApiProperty() resourceCount!: number;
  @ApiProperty() mediaTypeCount!: number;
  @ApiProperty({ description: 'True once the node passes the depth gate' })
  published!: boolean;
}

export class TaxonomyTreeNodeDto extends TaxonomyNodeDto {
  @ApiProperty({ type: () => [TaxonomyTreeNodeDto] })
  children!: TaxonomyTreeNodeDto[];
}

export class ResourceSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: MEDIA_TYPES }) mediaType!: string;
  @ApiProperty() provider!: string;
  @ApiProperty() language!: string;
  @ApiProperty({ enum: LICENCE_CODES }) licence!: string;
  @ApiProperty({ enum: USAGE_TIERS }) usageTier!: string;
  @ApiProperty({ enum: COST_MODELS }) costModel!: string;
  @ApiProperty({ type: Number, nullable: true })
  durationSeconds!: number | null;
  @ApiProperty({ type: Number, nullable: true }) pageCount!: number | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastVerifiedAt!: string | null;
}

export class TierCapabilitiesDto {
  @ApiProperty() deepLink!: boolean;
  @ApiProperty() embed!: boolean;
  @ApiProperty() mirror!: boolean;
  @ApiProperty() affiliate!: boolean;
}

export class ResourceDetailDto extends ResourceSummaryDto {
  @ApiProperty({ format: 'uri' }) canonicalUrl!: string;
  @ApiProperty({
    type: String,
    format: 'uri',
    nullable: true,
    description: 'Only present when the usage tier permits embedding',
  })
  embedUrl!: string | null;
  @ApiProperty({
    format: 'uri',
    description:
      'Where the visitor should be sent: the affiliate link where the tier permits one, otherwise the canonical URL',
  })
  outboundUrl!: string;
  @ApiProperty({ type: String, nullable: true })
  attributionText!: string | null;
  @ApiProperty({ type: [String] }) authors!: string[];
  @ApiProperty({ type: String, nullable: true }) isbn!: string | null;
  @ApiProperty({ type: TierCapabilitiesDto })
  capabilities!: TierCapabilitiesDto;
}

export class ResourceFacetsDto {
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  mediaType!: Record<string, number>;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  costModel!: Record<string, number>;
}

export class ResourceListDto {
  @ApiProperty({ type: [ResourceSummaryDto] }) items!: ResourceSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty({ type: ResourceFacetsDto }) facets!: ResourceFacetsDto;
}

export class TopicDemandRequestDto {
  @ApiProperty({
    type: String,
    required: false,
    description: 'Optional identifier such as an email or session handle',
  })
  requestedBy?: string;
}

export class TopicDemandSummaryDto {
  @ApiProperty() slug!: string;
  @ApiProperty() count!: number;
  @ApiProperty({ type: String, nullable: true }) requestedBy!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) requestedAt!: string;
}

export class TopicDemandEventDto extends TopicDemandSummaryDto {
  @ApiProperty() nodeSlug!: string;
}
