import { Router } from 'express';
import { createReportBody, idParam, reportListQuery, resolveReportBody } from '@campushub/shared';
import { config, isFeatureOn } from '../../config.js';
import { forbidden } from '../../lib/errors.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { valid, validate } from '../../middleware/validate.js';
import { createReport, listReports, resolveReport } from './service.js';

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

const panelOnly = (): void => {
  if (!isFeatureOn('moderationPanel')) throw forbidden('Panoul de moderare e dezactivat');
};

const queueSchemas = { query: reportListQuery };

moderationRouter.get(
  '/moderation/reports',
  requireRole('moderator'),
  validate(queueSchemas),
  async (req, res) => {
    panelOnly();
    const { query } = valid<typeof queueSchemas>(req);
    res.json(await listReports(config.facultyId, query));
  },
);

const resolveSchemas = { params: idParam, body: resolveReportBody };

moderationRouter.patch(
  '/moderation/reports/:id',
  requireRole('moderator'),
  validate(resolveSchemas),
  async (req, res) => {
    panelOnly();
    const { params, body } = valid<typeof resolveSchemas>(req);
    res.json({ data: await resolveReport(config.facultyId, params.id, req.user!.id, body) });
  },
);
