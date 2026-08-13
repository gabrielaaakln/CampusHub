import { Router } from 'express';
import { groupListQuery, norm } from '@campushub/shared';
import type { StudyGroupDto, SubjectDto } from '@campushub/shared';
import { config } from '../../config.js';
import { prisma } from '../../lib/db.js';
import { valid, validate } from '../../middleware/validate.js';

export const catalogRouter: Router = Router();

const listSchemas = { query: groupListQuery };

// the profile screen needs real groups nobody should type their group by hand
catalogRouter.get('/groups', validate(listSchemas), async (req, res) => {
  const { query } = valid<typeof listSchemas>(req);

  const rows = await prisma.studyGroup.findMany({
    where: {
      facultyId: config.facultyId,
      ...(query.studyYear ? { studyYear: query.studyYear } : {}),
      ...(query.q ? { nameNorm: { contains: norm(query.q) } } : {}),
    },
    orderBy: [{ studyYear: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, studyYear: true, subgroups: true },
  });

  res.json({ data: rows satisfies StudyGroupDto[] });
});

catalogRouter.get('/subjects', async (_req, res) => {
  const rows = await prisma.subject.findMany({
    where: { facultyId: config.facultyId },
    orderBy: [{ name: 'asc' }],
    select: { id: true, name: true, shortName: true, studyYear: true },
  });

  res.json({ data: rows satisfies SubjectDto[] });
});
