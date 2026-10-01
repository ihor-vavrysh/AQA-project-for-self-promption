import { z } from 'zod';

const EnvironmentSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine((url) =>
      ['postgres:', 'postgresql:'].includes(new URL(url).protocol),
    ),
  AUTH0_DOMAIN: z.string().regex(/^[a-z0-9.-]+$/i),
  AUTH0_AUDIENCE: z.url(),
  PORT: z.coerce.number().int().positive().default(3000),
});

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  return EnvironmentSchema.parse(environment);
}
