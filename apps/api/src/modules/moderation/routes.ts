import { Router } from 'express';
import { createReportBody } from '@campushub/shared';
import { config } from '../../config.js';
import { requireAuth } from '../../middleware/auth.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { valid, validate } from '../../middleware/validate.js';
import { createReport } from './service.js';

export const moderationRouter: Router = Router();

const reportSchemas = { body: createReportBody };

// reporting is n0 and stays on even when the queue screen is hidden behind its flag
moderationRouter.post(
  '/reports',
  requireAuth,
  writeLimiter,
  validate(reportSchemas),
  async (req, res) => {
    const { body } = valid<typeof reportSchemas>(req);
    const created = await createReport(config.facultyId, req.user!.id, body);
    res.status(201).json({ data: { id: created.id, status: 'open' } });
  },
);
