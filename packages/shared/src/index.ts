export * from './suggestions.js';
export * from './catalog.js';

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
