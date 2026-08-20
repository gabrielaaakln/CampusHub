import { Router } from 'express';
import { DateTime } from 'luxon';
import {
  calendarIcsQuery,
  calendarQuery,
  ICS_DAYS_AFTER,
  ICS_DAYS_BEFORE,
} from '@campushub/shared';
import { config, isFeatureOn } from '../../config.js';
import { notFound } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { valid, validate } from '../../middleware/validate.js';
import { calendarFor } from './service.js';
import { toIcs } from './ics.js';

export const calendarRouter: Router = Router();

const schemas = { query: calendarQuery };

const icsSchemas = { query: calendarIcsQuery };

// declared before /me/calendar so the extension is not read as part of that path
calendarRouter.get('/me/calendar.ics', requireAuth, validate(icsSchemas), async (req, res) => {
  if (!isFeatureOn('icsExport')) throw notFound();

  const { query } = valid<typeof icsSchemas>(req);
  const user = req.user!;
  const today = DateTime.now();

  const data = await calendarFor({
    facultyId: user.facultyId ?? config.facultyId,
    groupId: user.groupId,
    subgroup: user.subgroup,
    from: query.from ?? today.minus({ days: ICS_DAYS_BEFORE }).toISODate()!,
    to: query.to ?? today.plus({ days: ICS_DAYS_AFTER }).toISODate()!,
  });

  const name = user.groupName ? `CampusHub ${user.groupName}` : 'CampusHub';
  res.type('text/calendar; charset=utf-8');
  res.setHeader('content-disposition', 'attachment; filename="campushub.ics"');
  res.send(toIcs(data.items, name));
});

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
