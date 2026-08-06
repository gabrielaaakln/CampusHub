import { createApp } from './app.js';
import { config, featureSummary } from './config.js';
import { logger } from './lib/logger.js';

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info(`api listening on :${config.port} (${config.env})`);
  logger.info(`features: ${featureSummary()}`);
  // one line in staging logs saves an hour of confusion
  if (!config.features.scraper) logger.info('scheduler: disabled (FEATURE_SCRAPER=false)');
  if (config.devLogin) logger.warn('DEV_LOGIN is on: x-dev-user header impersonates any account');
  // nothing checks that the address belongs to the person until emailVerify exists
  if (config.isProduction && config.features.registration && !config.features.emailVerify) {
    logger.warn('FEATURE_REGISTRATION is on without email verification: anyone can claim an address');
  }
});
