import { z } from 'zod';

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const Auth0ClaimsSchema = z
  .object({
    sub: z.string().min(1),
    email: z.email().optional(),
  })
  .passthrough();

export type Auth0Claims = z.infer<typeof Auth0ClaimsSchema>;

export const CurrentUserResponseSchema = z.object({
  id: z.uuid(),
  email: z.email().nullable(),
  createdAt: z.iso.datetime(),
});

export type CurrentUserResponse = z.infer<typeof CurrentUserResponseSchema>;

export const LearnerAgeBandSchema = z.enum([
  '5-7',
  '8-10',
  '11-13',
  '14-16',
  '17-18',
]);
export const LearnerLearningPreferenceSchema = z.enum([
  'visual',
  'narrative',
  'step-by-step',
  'challenge-first',
]);
export const LearnerConfidenceLevelSchema = z.enum([
  'low',
  'developing',
  'confident',
  'high',
]);
export const LearnerAttentionSpanSchema = z.enum([
  'under-10-minutes',
  '10-20-minutes',
  'over-20-minutes',
]);

const LearnerProfileFields = {
  pseudonym: z.string().trim().min(1).max(40),
  ageBand: LearnerAgeBandSchema,
  locale: z.string().trim().min(2).max(20),
  curriculumCode: z.string().trim().min(1).max(40),
  interests: z.array(z.string().trim().min(1).max(40)).max(10),
  learningPreference: LearnerLearningPreferenceSchema,
  confidenceLevel: LearnerConfidenceLevelSchema,
  attentionSpan: LearnerAttentionSpanSchema,
  gender: z.string().trim().max(64).nullable(),
  subject: z.string().trim().min(1).max(80),
  level: z.string().trim().min(1).max(80),
};

export const CreateLearnerRequestSchema = z
  .object(LearnerProfileFields)
  .strict();
export type CreateLearnerRequest = z.infer<typeof CreateLearnerRequestSchema>;

export const UpdateLearnerRequestSchema = CreateLearnerRequestSchema.partial()
  .strict()
  .refine((profile) => Object.keys(profile).length > 0, {
    message: 'At least one profile field must be provided',
  });
export type UpdateLearnerRequest = z.infer<typeof UpdateLearnerRequestSchema>;

export const LearnerResponseSchema = z.object({
  id: z.uuid(),
  pseudonym: LearnerProfileFields.pseudonym,
  ageBand: LearnerAgeBandSchema,
  locale: LearnerProfileFields.locale,
  curriculumCode: LearnerProfileFields.curriculumCode,
  interests: LearnerProfileFields.interests,
  learningPreference: LearnerLearningPreferenceSchema,
  confidenceLevel: LearnerConfidenceLevelSchema,
  attentionSpan: LearnerAttentionSpanSchema,
  gender: LearnerProfileFields.gender,
  subject: LearnerProfileFields.subject,
  level: LearnerProfileFields.level,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type LearnerResponse = z.infer<typeof LearnerResponseSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const PublicAppConfigSchema = z.object({
  auth0: z.object({
    domain: z.string(),
    clientId: z.string(),
    audience: z.union([z.literal(''), z.url()]),
  }),
});

export type PublicAppConfig = z.infer<typeof PublicAppConfigSchema>;
