import { Router } from 'express';
import { calendarQuery } from '@campushub/shared';
import { config } from '../../config.js';
import { requireAuth } from '../../middleware/auth.js';
import { valid, validate } from '../../middleware/validate.js';
import { calendarFor } from './service.js';

export const calendarRouter: Router = Router();

const schemas = { query: calendarQuery };

// one shape for every source the frontend knows nothing about parity or breaks
calendarRouter.get('/me/calendar', requireAuth, validate(schemas), async (req, res) => {
  const { query } = valid<typeof schemas>(req);
  const user = req.user!;

  res.json({
    data: await calendarFor({
      facultyId: user.facultyId ?? config.facultyId,
      groupId: query.groupId ?? user.groupId,
      subgroup: query.subgroup ?? user.subgroup,
      from: query.from,
      to: query.to,
    }),
  });
});
