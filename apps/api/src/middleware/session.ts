import type { RequestHandler } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { config } from '../config.js';

// secure cookies behind a proxy need trust proxy in app ts or the cookie is dropped silently
export function sessionMiddleware(): RequestHandler {
  const PgStore = connectPgSimple(session);

  return session({
    name: config.session.cookieName,
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new PgStore({
      conString: config.databaseUrl,
      tableName: 'user_sessions',
      createTableIfMissing: false,
      pruneSessionInterval: config.isTest ? false : 60 * 15,
    }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      path: '/',
      maxAge: config.session.maxAgeMs,
    },
  });
}
