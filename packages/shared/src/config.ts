import { z } from 'zod';

export const FEATURE_KEYS = [
  'scraper',
  'floorplans',
  'uploads',
  'sse',
  'emailVerify',
  'events',
  'moderationPanel',
  'icsExport',
  'sso',
  'passwordLogin',
  'registration',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type Features = Record<FeatureKey, boolean>;

export const featuresSchema = z.object(
  Object.fromEntries(FEATURE_KEYS.map((k) => [k, z.boolean()])) as {
    [K in FeatureKey]: z.ZodBoolean;
  },
);

export const appConfigSchema = z.object({
  features: featuresSchema,
  faculty: z
    .object({
      id: z.number().int(),
      shortName: z.string().nullable(),
      name: z.string(),
      timezone: z.string(),
    })
    .nullable(),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
