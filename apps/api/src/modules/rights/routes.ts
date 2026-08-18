import { Router } from 'express';
import { rightsListQuery } from '@campushub/shared';
import { config } from '../../config.js';
import { valid, validate } from '../../middleware/validate.js';
import { listRights } from './service.js';

export const rightsRouter: Router = Router();

const listSchemas = { query: rightsListQuery };

// the content comes from the seed it is written by hand and reviewed not user generated
rightsRouter.get('/rights', validate(listSchemas), async (req, res) => {
  const { query } = valid<typeof listSchemas>(req);
  res.json(await listRights(config.facultyId, query));
});
