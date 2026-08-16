import { Router } from 'express';
import {
  createDeadlineBody,
  deadlineListQuery,
  idParam,
  updateDeadlineBody,
} from '@campushub/shared';
import { config } from '../../config.js';
import { prisma } from '../../lib/db.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { valid, validate } from '../../middleware/validate.js';
import { deadlineById, listDeadlines } from './service.js';

export const deadlinesRouter: Router = Router();

async function facultyZone(): Promise<string> {
  const faculty = await prisma.faculty.findUnique({
    where: { id: config.facultyId },
    select: { timezone: true },
  });
  return faculty?.timezone ?? 'Europe/Bucharest';
}

const listSchemas = { query: deadlineListQuery };

deadlinesRouter.get('/deadlines', validate(listSchemas), async (req, res) => {
  const { query } = valid<typeof listSchemas>(req);
  res.json(
    await listDeadlines(
      config.facultyId,
      query,
      { id: req.user?.id ?? null, groupId: req.user?.groupId ?? null },
      await facultyZone(),
    ),
  );
});

const createSchemas = { body: createDeadlineBody };

deadlinesRouter.post('/deadlines', requireAuth, writeLimiter, validate(createSchemas), async (req, res) => {
  const { body } = valid<typeof createSchemas>(req);
  const user = req.user!;

  // no group means the whole faculty which is a moderator decision not a student one
  const groupId = body.groupId === undefined ? user.groupId : body.groupId;
  if (groupId === null && user.role === 'student') {
    throw forbidden('Doar moderatorii pot pune un termen pentru toată facultatea');
  }
  if (groupId !== null) {
    const group = await prisma.studyGroup.findFirst({
      where: { id: groupId, facultyId: config.facultyId },
      select: { id: true },
    });
    if (!group) throw badRequest('Grupa nu există', { field: 'groupId' });
  }

  const created = await prisma.deadline.create({
    data: {
      facultyId: config.facultyId,
      groupId,
      subjectId: body.subjectId ?? null,
      createdBy: user.id,
      title: body.title,
      type: body.type,
      dueAt: new Date(body.dueAt),
      description: body.description ?? null,
    },
    select: { id: true },
  });

  res.status(201).json({ data: await deadlineById(config.facultyId, created.id, user.id) });
});

const patchSchemas = { params: idParam, body: updateDeadlineBody };

deadlinesRouter.patch('/deadlines/:id', requireAuth, validate(patchSchemas), async (req, res) => {
  const { params, body } = valid<typeof patchSchemas>(req);
  const deadline = await mineOrFail(params.id, req.user!.id, req.user!.role);

  await prisma.deadline.update({
    where: { id: deadline.id },
    data: {
      ...(body.title === undefined ? {} : { title: body.title }),
      ...(body.type === undefined ? {} : { type: body.type }),
      ...(body.dueAt === undefined ? {} : { dueAt: new Date(body.dueAt) }),
      ...(body.subjectId === undefined ? {} : { subjectId: body.subjectId }),
      ...(body.description === undefined ? {} : { description: body.description }),
    },
  });

  res.json({ data: await deadlineById(config.facultyId, deadline.id, req.user!.id) });
});

deadlinesRouter.delete(
  '/deadlines/:id',
  requireAuth,
  validate({ params: idParam }),
  async (req, res) => {
    const { params } = valid<{ params: typeof idParam }>(req);
    const deadline = await mineOrFail(params.id, req.user!.id, req.user!.role);
    await prisma.deadline.update({ where: { id: deadline.id }, data: { isDeleted: true } });
    res.status(204).end();
  },
);

async function mineOrFail(id: number, userId: number, role: string) {
  const deadline = await prisma.deadline.findFirst({
    where: { id, facultyId: config.facultyId, isDeleted: false },
    select: { id: true, createdBy: true },
  });
  if (!deadline) throw notFound('Termenul nu există');
  if (deadline.createdBy !== userId && role === 'student') throw forbidden();
  return deadline;
}
