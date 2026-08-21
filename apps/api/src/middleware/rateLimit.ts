import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { ApiErrorBody } from '@campushub/shared';
import { config } from '../config.js';

const TOO_MANY: ApiErrorBody = {
  error: { code: 'rate_limited', message: 'Prea multe cereri, încearcă mai târziu' },
};

/**
 * cloudflare carries the real client address but only if cloudflare is really in front
 *
 * anyone can send cf-connecting-ip so trusting it on an exposed server hands every caller a fresh
 * bucket per request which is the same as having no rate limit at all it is opt in and off by
 * default behind the tunnel express already resolves req ip from x-forwarded-for and trust proxy
 */
const keyGenerator = (req: Request): string => {
  const forwarded = config.trustCloudflareHeader ? req.get('cf-connecting-ip') : undefined;
  return forwarded ?? ipKeyGenerator(req.ip ?? 'unknown');
};

const base = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  keyGenerator,
  skip: () => config.isTest,
  message: TOO_MANY,
};

export const globalLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 100 });

/** anything that writes a row someone else will read */
export const writeLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 10 });

/** a vote is one click so the ceiling sits where a person stops and a script starts */
export const voteLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 30 });

/** full text and trigram queries are the most expensive read in the application */
export const searchLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 30 });

/** one import walks the whole timetable so even an admin does not get to loop it */
export const importLimiter = rateLimit({ ...base, windowMs: 15 * 60_000, limit: 5 });

export const loginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 5,
  skipSuccessfulRequests: true,
});
