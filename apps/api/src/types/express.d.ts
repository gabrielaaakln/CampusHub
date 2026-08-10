import type { SessionUser } from '@campushub/shared';

declare global {
  namespace Express {
    interface Request {
      /** set by the validate middleware */
      valid: Record<string, unknown>;
      /** set by loadUser when a session exists */
      user?: SessionUser;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    /** set when a csrf token was issued so the anonymous session persists */
    csrfBound?: boolean;
  }
}

export {};
