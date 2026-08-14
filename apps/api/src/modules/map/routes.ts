import { Router } from 'express';
import { z } from 'zod';
import { idParam, roomSearchQuery } from '@campushub/shared';
import { config } from '../../config.js';
import { searchLimiter } from '../../middleware/rateLimit.js';
import { valid, validate } from '../../middleware/validate.js';
import { currentTerm } from '../schedule/service.js';
import {
  listBuildings,
  listFloors,
  listRooms,
  roomById,
  roomClasses,
  searchRooms,
} from './service.js';

export const mapRouter: Router = Router();

const facultyQuery = {
  query: z.object({ facultyId: z.coerce.number().int().positive().optional() }),
};

mapRouter.get('/buildings', validate(facultyQuery), async (req, res) => {
  const { query } = valid<typeof facultyQuery>(req);
  res.json({ data: await listBuildings(query.facultyId ?? config.facultyId) });
});

mapRouter.get('/buildings/:id/floors', validate({ params: idParam }), async (req, res) => {
  const { params } = valid<{ params: typeof idParam }>(req);
  res.json({ data: await listFloors(config.facultyId, params.id) });
});

mapRouter.get('/floors/:id/rooms', validate({ params: idParam }), async (req, res) => {
  const { params } = valid<{ params: typeof idParam }>(req);
  res.json({ data: await listRooms(config.facultyId, params.id) });
});

// declared before /rooms/:id so search is not read as an id
mapRouter.get('/rooms/search', searchLimiter, validate({ query: roomSearchQuery }), async (req, res) => {
  const { query } = valid<{ query: typeof roomSearchQuery }>(req);
  res.json({ data: await searchRooms(config.facultyId, query.q, query.limit) });
});

mapRouter.get('/rooms/:id', validate({ params: idParam }), async (req, res) => {
  const { params } = valid<{ params: typeof idParam }>(req);
  const room = await roomById(config.facultyId, params.id);
  const term = await currentTerm(config.facultyId).catch(() => null);
  res.json({
    data: { ...room, classes: term ? await roomClasses(room.id, term.id) : [] },
  });
});
