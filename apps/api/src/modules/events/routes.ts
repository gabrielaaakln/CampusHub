import { Router } from 'express';
import { createEventBody, eventListQuery, idParam } from '@campushub/shared';
import { config } from '../../config.js';
import { prisma } from '../../lib/db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { valid, validate } from '../../middleware/validate.js';
import { attend, eventById, listEvents, withdraw } from './service.js';

export const eventsRouter: Router = Router();

const listSchemas = { query: eventListQuery };

eventsRouter.get('/events', validate(listSchemas), async (req, res) => {
  const { query } = valid<typeof listSchemas>(req);
  res.json(await listEvents(config.facultyId, query, req.user?.id ?? null));
});

const createSchemas = { body: createEventBody };

eventsRouter.post(
  '/events',
  requireRole('moderator'),
  writeLimiter,
  validate(createSchemas),
  async (req, res) => {
    const { body } = valid<typeof createSchemas>(req);

    if (body.roomId) {
      const room = await prisma.room.findFirst({
        where: { id: body.roomId, floor: { building: { facultyId: config.facultyId } } },
        select: { id: true },
      });
      if (!room) throw badRequest('Sala nu există', { field: 'roomId' });
    }

    const created = await prisma.event.create({
      data: {
        facultyId: config.facultyId,
        createdBy: req.user!.id,
        title: body.title,
        description: body.description ?? null,
        location: body.location ?? null,
        roomId: body.roomId ?? null,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        externalUrl: body.externalUrl ?? null,
      },
      select: { id: true },
    });

    res.status(201).json({ data: await eventById(config.facultyId, created.id, req.user!.id) });
  },
);

eventsRouter.get('/events/:id', validate({ params: idParam }), async (req, res) => {
  const { params } = valid<{ params: typeof idParam }>(req);
  res.json({ data: await eventById(config.facultyId, params.id, req.user?.id ?? null) });
});

eventsRouter.delete(
  '/events/:id',
  requireRole('moderator'),
  validate({ params: idParam }),
  async (req, res) => {
    const { params } = valid<{ params: typeof idParam }>(req);
    const event = await prisma.event.findFirst({
      where: { id: params.id, facultyId: config.facultyId, isDeleted: false },
      select: { id: true },
    });
    if (!event) throw notFound('Evenimentul nu există');

    await prisma.event.update({ where: { id: event.id }, data: { isDeleted: true } });
    res.status(204).end();
  },
);

eventsRouter.post(
  '/events/:id/attend',
  requireAuth,
  writeLimiter,
  validate({ params: idParam }),
  async (req, res) => {
    const { params } = valid<{ params: typeof idParam }>(req);
    await eventById(config.facultyId, params.id, req.user!.id);
    await attend(params.id, req.user!.id);
    res.json({ data: await eventById(config.facultyId, params.id, req.user!.id) });
  },
);

eventsRouter.delete(
  '/events/:id/attend',
  requireAuth,
  writeLimiter,
  validate({ params: idParam }),
  async (req, res) => {
    const { params } = valid<{ params: typeof idParam }>(req);
    await eventById(config.facultyId, params.id, req.user!.id);
    await withdraw(params.id, req.user!.id);
    res.json({ data: await eventById(config.facultyId, params.id, req.user!.id) });
  },
);
