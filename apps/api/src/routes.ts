import { Router } from 'express';
import { healthRouter } from './modules/health/routes.js';
import { configRouter } from './modules/config/routes.js';
import { authRouter } from './modules/auth/routes.js';
import { scheduleRouter } from './modules/schedule/routes.js';
import { mapRouter } from './modules/map/routes.js';
import { catalogRouter } from './modules/catalog/routes.js';
import { doubleCsrfProtection, generateCsrfToken } from './middleware/csrf.js';

export const apiRouter: Router = Router();

const ANONYMOUS_SESSION_MS = 2 * 60 * 60 * 1000;

// read only and needed before any state changing call
apiRouter.use(healthRouter);
apiRouter.use(configRouter);
// the token is bound to the session id and an anonymous session is not saved
// by default so without this every request gets a new id and the token never matches
apiRouter.get('/csrf', async (req, res) => {
  req.session.csrfBound = true;
  // an anonymous visitor still gets a row in user_sessions so it must not sit there for a month
  // logging in regenerates the session and the full lifetime comes back with it
  if (!req.session.userId) req.session.cookie.maxAge = ANONYMOUS_SESSION_MS;
  await new Promise<void>((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve())),
  );
  // overwrite because login rotates the session id and a reused token stays bound to the old one
  res.json({ data: { token: generateCsrfToken(req, res, { overwrite: true }) } });
});

apiRouter.use(doubleCsrfProtection);

apiRouter.use(authRouter);
apiRouter.use(scheduleRouter);
apiRouter.use(mapRouter);
apiRouter.use(catalogRouter);
