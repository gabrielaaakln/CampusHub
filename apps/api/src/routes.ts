import { Router } from 'express';
import { healthRouter } from './modules/health/routes.js';
import { configRouter } from './modules/config/routes.js';

export const apiRouter: Router = Router();
// read only and needed before any state changing call
apiRouter.use(healthRouter);
apiRouter.use(configRouter);
