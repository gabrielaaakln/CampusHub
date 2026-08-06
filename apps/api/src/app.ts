import express, { type Express } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { apiRouter } from './routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { globalLimiter } from './middleware/rateLimit.js';

export function createApp(): Express {
  const app = express();

  // never guess this number see campushub-hosting md section 4
  app.set('trust proxy', config.trustProxyHops);
  app.disable('x-powered-by');

  app.use(pinoHttp({ logger, autoLogging: !config.isTest }));
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser(config.session.secret));
  app.use(globalLimiter);

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
