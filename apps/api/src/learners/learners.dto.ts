import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LearnerAgeBandSchema,
  LearnerAttentionSpanSchema,
  LearnerConfidenceLevelSchema,
  LearnerLearningPreferenceSchema,
} from '@tutorforge/shared';

const ageBands = LearnerAgeBandSchema.options;
const learningPreferences = LearnerLearningPreferenceSchema.options;
const confidenceLevels = LearnerConfidenceLevelSchema.options;
const attentionSpans = LearnerAttentionSpanSchema.options;

export class LearnerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    maxLength: 40,
    description: 'Pseudonymous handle; do not use a real name',
  })
  pseudonym!: string;

  @ApiProperty({ enum: ageBands })
  ageBand!: (typeof ageBands)[number];

  @ApiProperty({ maxLength: 20, example: 'en-GB' })
  locale!: string;

  @ApiProperty({ maxLength: 40, example: 'KS3' })
  curriculumCode!: string;

  @ApiProperty({ type: [String], maxItems: 10 })
  interests!: string[];

  @ApiProperty({ enum: learningPreferences })
  learningPreference!: (typeof learningPreferences)[number];

  @ApiProperty({ enum: confidenceLevels })
  confidenceLevel!: (typeof confidenceLevels)[number];

  @ApiProperty({ enum: attentionSpans })
  attentionSpan!: (typeof attentionSpans)[number];

  @ApiProperty({ type: String, nullable: true, maxLength: 64 })
  gender!: string | null;

  @ApiProperty({ maxLength: 80 })
  subject!: string;

  @ApiProperty({ maxLength: 80 })
  level!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class CreateLearnerDto {
  @ApiProperty({
    maxLength: 40,
    description: 'Pseudonymous handle; do not use a real name',
  })
  pseudonym!: string;

  @ApiProperty({ enum: ageBands })
  ageBand!: (typeof ageBands)[number];

  @ApiProperty({ maxLength: 20, example: 'en-GB' })
  locale!: string;

  @ApiProperty({ maxLength: 40, example: 'KS3' })
  curriculumCode!: string;

  @ApiProperty({ type: [String], maxItems: 10 })
  interests!: string[];

  @ApiProperty({ enum: learningPreferences })
  learningPreference!: (typeof learningPreferences)[number];

  @ApiProperty({ enum: confidenceLevels })
  confidenceLevel!: (typeof confidenceLevels)[number];

  @ApiProperty({ enum: attentionSpans })
  attentionSpan!: (typeof attentionSpans)[number];

  @ApiProperty({ type: String, nullable: true, maxLength: 64 })
  gender!: string | null;

  @ApiProperty({ maxLength: 80 })
  subject!: string;

  @ApiProperty({ maxLength: 80 })
  level!: string;
}

export class UpdateLearnerDto {
  @ApiPropertyOptional({ maxLength: 40 })
  pseudonym?: string;

  @ApiPropertyOptional({ enum: ageBands })
  ageBand?: (typeof ageBands)[number];

  @ApiPropertyOptional({ maxLength: 20 })
  locale?: string;

  @ApiPropertyOptional({ maxLength: 40 })
  curriculumCode?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 10 })
  interests?: string[];

  @ApiPropertyOptional({ enum: learningPreferences })
  learningPreference?: (typeof learningPreferences)[number];

  @ApiPropertyOptional({ enum: confidenceLevels })
  confidenceLevel?: (typeof confidenceLevels)[number];

  @ApiPropertyOptional({ enum: attentionSpans })
  attentionSpan?: (typeof attentionSpans)[number];

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 64 })
  gender?: string | null;

  @ApiPropertyOptional({ maxLength: 80 })
  subject?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  level?: string;
}
