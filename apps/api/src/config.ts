import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { FEATURE_KEYS, type FeatureKey, type Features } from '@campushub/shared';

// repo root first then the api folder in containers there is no file and this is a no op
loadDotenv({
  path: [
    resolve(fileURLToPath(new URL('../../../', import.meta.url)), '.env'),
    resolve(process.cwd(), '.env'),
  ],
  quiet: true,
});

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    // trimmed like the pasted values below: a stray space turns every flag silently off
    .transform((v) => {
      const value = v?.trim();
      return value === undefined || value === '' ? fallback : TRUE_VALUES.has(value.toLowerCase());
    });

const trimmed = z.string().transform((v) => v.trim());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().optional(),
  PUBLIC_URL: z.string().default('http://localhost:5173'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  // only turn on when cloudflare really is in front anyone can forge the header otherwise
  TRUST_CF_CONNECTING_IP: bool(false),
  ALLOWED_EMAIL_DOMAINS: z.string().default('tuiasi.ro,student.tuiasi.ro'),
  FACULTY_ID: z.coerce.number().int().positive().default(1),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  UPLOAD_DIR: z.string().default('uploads'),
  SNAPSHOT_DIR: z.string().default('snapshots'),
  DEV_LOGIN: bool(false),
  FEATURE_SCRAPER: bool(false),
  FEATURE_FLOORPLANS: bool(false),
  // off until POST /listings/:id/images exists config must not promise what is not built
  FEATURE_UPLOADS: bool(false),
  FEATURE_SSE: bool(false),
  FEATURE_EMAIL_VERIFY: bool(false),
  FEATURE_EVENTS: bool(true),
  FEATURE_MODERATION_PANEL: bool(true),
  FEATURE_ICS_EXPORT: bool(true),
  FEATURE_SSO: bool(false),
  // the password form stays for the demo accounts and the tests it is not a way to get an account
  FEATURE_PASSWORD_LOGIN: bool(true),
  // signing up is a separate decision from signing in nothing proves the address is yours until
  // emailVerify exists so an open form on a public site hands out institutional looking accounts
  // left unset it follows the environment on in development off in production
  FEATURE_REGISTRATION: z.string().optional(),
  // pasted out of a portal so a stray space around the value is normal and must not break anything
  // the tuiasi tenant discovered from the domain itself both tuiasi.ro and student.tuiasi.ro sit in it
  AZURE_TENANT_ID: trimmed.default('607d63ca-9f36-4ad8-9f71-8b3efc392eb1'),
  AZURE_CLIENT_ID: trimmed.optional(),
  AZURE_CLIENT_SECRET: trimmed.optional(),
  AZURE_REDIRECT_URI: trimmed.default('http://localhost:5173/api/v1/auth/sso/callback'),
  // sends the user straight to the university idp instead of the microsoft account picker
  AZURE_DOMAIN_HINT: trimmed.optional(),
});

const DEV_SESSION_SECRET = 'campushub-development-secret-not-for-production';

function load(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    const hint = env.DATABASE_URL ? '' : '\n\nNo .env found. Start from the template: cp .env.example .env';
    throw new Error(`Invalid environment:\n${lines.join('\n')}${hint}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';

  // mock auth is a boot time refusal not a convention
  if (isProduction && e.DEV_LOGIN) {
    throw new Error('DEV_LOGIN must not be set in production');
  }
  if (isProduction && (!e.SESSION_SECRET || e.SESSION_SECRET.length < 32)) {
    throw new Error('SESSION_SECRET is required in production and must be at least 32 characters');
  }

  const raw = e.FEATURE_REGISTRATION?.trim().toLowerCase();
  const registrationAsked = raw === undefined || raw === '' ? !isProduction : TRUE_VALUES.has(raw);

  const features: Features = {
    scraper: e.FEATURE_SCRAPER,
    floorplans: e.FEATURE_FLOORPLANS,
    uploads: e.FEATURE_UPLOADS,
    sse: e.FEATURE_SSE,
    emailVerify: e.FEATURE_EMAIL_VERIFY,
    events: e.FEATURE_EVENTS,
    moderationPanel: e.FEATURE_MODERATION_PANEL,
    icsExport: e.FEATURE_ICS_EXPORT,
    sso: e.FEATURE_SSO,
    passwordLogin: e.FEATURE_PASSWORD_LOGIN,
    // the form itself is the password form so it cannot outlive it
    registration: registrationAsked && e.FEATURE_PASSWORD_LOGIN,
  };

  // a login button that cannot work is worse than no button so the flag refuses to start half wired
  if (features.sso && !(e.AZURE_CLIENT_ID && e.AZURE_CLIENT_SECRET)) {
    throw new Error('FEATURE_SSO needs AZURE_CLIENT_ID and AZURE_CLIENT_SECRET');
  }
  if (!features.sso && !features.passwordLogin) {
    throw new Error('no way in: turn on FEATURE_SSO or FEATURE_PASSWORD_LOGIN');
  }

  return {
    env: e.NODE_ENV,
    isProduction,
    isTest: e.NODE_ENV === 'test',
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    publicUrl: e.PUBLIC_URL.replace(/\/$/, ''),
    trustProxyHops: e.TRUST_PROXY_HOPS,
    trustCloudflareHeader: e.TRUST_CF_CONNECTING_IP,
    facultyId: e.FACULTY_ID,
    logLevel: e.LOG_LEVEL,
    devLogin: e.DEV_LOGIN,
    allowedEmailDomains: e.ALLOWED_EMAIL_DOMAINS.split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    session: {
      secret: e.SESSION_SECRET ?? DEV_SESSION_SECRET,
      cookieName: isProduction ? '__Host-ch.sid' : 'ch.sid',
      maxAgeMs: 1000 * 60 * 60 * 24 * 30,
    },
    paths: { uploadDir: e.UPLOAD_DIR, snapshotDir: e.SNAPSHOT_DIR },
    sso: {
      tenantId: e.AZURE_TENANT_ID,
      clientId: e.AZURE_CLIENT_ID ?? '',
      clientSecret: e.AZURE_CLIENT_SECRET ?? '',
      redirectUri: e.AZURE_REDIRECT_URI,
      domainHint: e.AZURE_DOMAIN_HINT ?? null,
      authority: `https://login.microsoftonline.com/${e.AZURE_TENANT_ID}`,
      issuer: `https://login.microsoftonline.com/${e.AZURE_TENANT_ID}/v2.0`,
    },
    features,
  };
}

export type AppServerConfig = ReturnType<typeof load>;

export const config: AppServerConfig = load();

export function isFeatureOn(key: FeatureKey): boolean {
  return config.features[key];
}

export function featureSummary(): string {
  return FEATURE_KEYS.map((k) => `${k}=${config.features[k]}`).join(' ');
}
