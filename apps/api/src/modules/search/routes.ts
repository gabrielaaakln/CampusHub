import { Router } from 'express';
import { searchQuery } from '@campushub/shared';
import { config } from '../../config.js';
import { searchLimiter } from '../../middleware/rateLimit.js';
import { valid, validate } from '../../middleware/validate.js';
import { search } from './service.js';

export const searchRouter: Router = Router();

const schemas = { query: searchQuery };

// one box over forum listings and rights the configuration ignores diacritics
searchRouter.get('/search', searchLimiter, validate(schemas), async (req, res) => {
  const { query } = valid<typeof schemas>(req);
  res.json(await search(config.facultyId, query));
});
