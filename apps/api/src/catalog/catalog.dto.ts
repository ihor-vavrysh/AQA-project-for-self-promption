import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AGE_BANDS,
  ATTENTION_SPANS,
  CHARACTER_FIT_TAGS,
  CONFIDENCE_LEVELS,
  COST_MODELS,
  LEARNING_PREFERENCES,
  LICENCE_CODES,
  MEDIA_TYPES,
  SUGGESTION_EMPTY_CAUSES,
  SUGGESTION_FACTORS,
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

// --- Suggestions -------------------------------------------------------------

export class LearnerContextDto {
  @ApiProperty({ description: 'Taxonomy node slug to suggest within' })
  node!: string;

  @ApiProperty({ enum: AGE_BANDS }) ageBand!: string;

  @ApiProperty({ example: 'en-GB', description: 'BCP-47 language tag' })
  locale!: string;

  @ApiPropertyOptional({
    enum: CHARACTER_FIT_TAGS,
    isArray: true,
    description: 'Learner interests, from a closed vocabulary',
  })
  interests?: string[];

  @ApiPropertyOptional({ enum: CONFIDENCE_LEVELS, default: 'medium' })
  confidence?: string;

  @ApiPropertyOptional({ enum: LEARNING_PREFERENCES, default: 'step-by-step' })
  learningPreference?: string;

  @ApiPropertyOptional({
    enum: ATTENTION_SPANS,
    default: 'medium',
    description: 'Accepted for forward compatibility; not yet used in ranking',
  })
  attentionSpan?: string;

  @ApiPropertyOptional({ default: false }) allowPaid?: boolean;

  @ApiPropertyOptional({ default: 6, minimum: 1, maximum: 50 }) limit?: number;

  @ApiPropertyOptional({
    enum: ['top', 'full'],
    default: 'top',
    description: '"full" also returns the factors that contributed nothing',
  })
  explain?: string;
}

export class SuggestionReasonDto {
  @ApiProperty({ enum: SUGGESTION_FACTORS }) factor!: string;

  @ApiProperty({ description: 'Ordinal level for this factor, e.g. "exact"' })
  level!: string;

  @ApiProperty({ description: 'Signed contribution to the score' })
  contribution!: number;
}

export class AgeGateDto {
  @ApiProperty({ enum: ['age-band-fit'] }) factor!: string;
  @ApiProperty({ enum: ['exact', 'adjacent', 'distant', 'none'] })
  level!: string;
  @ApiProperty({ description: 'Multiplies the whole weighted sum' })
  multiplier!: number;
}

export class SuggestionDto {
  @ApiProperty({ type: ResourceSummaryDto }) resource!: ResourceSummaryDto;
  @ApiProperty() score!: number;
  @ApiProperty({ type: AgeGateDto }) gate!: AgeGateDto;
  @ApiProperty({ type: [SuggestionReasonDto] }) reasons!: SuggestionReasonDto[];
  @ApiProperty({ description: 'Pushed down by a media-type or provider cap' })
  diversityCapped!: boolean;
}

export class SuggestionListDto {
  @ApiProperty({ type: [SuggestionDto] }) items!: SuggestionDto[];
  @ApiProperty() weightsVersion!: string;
  @ApiProperty() candidatesConsidered!: number;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: SUGGESTION_EMPTY_CAUSES,
    description: 'Why the list is empty; null when it is not',
  })
  emptyCause!: string | null;
}
