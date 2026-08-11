import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { config } from '../../config.js';
import { requireRole } from '../../middleware/auth.js';
import { importLimiter } from '../../middleware/rateLimit.js';
import { valid, validate } from '../../middleware/validate.js';
import { ManualAdapter } from './adapters/manual.js';
import { runImport } from './importer.js';
import { currentTerm, lastRun, recentChanges, termById, weekForGroup } from './service.js';

export const scheduleRouter: Router = Router();

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

const scheduleQuery = {
  query: z.object({
    groupId: z.coerce.number().int().positive().optional(),
    subgroup: z.coerce.number().int().min(1).max(4).optional(),
    termId: z.coerce.number().int().positive().optional(),
  }),
};

scheduleRouter.get('/schedule', validate(scheduleQuery), async (req, res) => {
  const { query } = valid<typeof scheduleQuery>(req);

  const groupId = query.groupId ?? req.user?.groupId ?? null;
  if (groupId === null) {
    throw badRequest('Alege-ți grupa din profil sau trimite groupId', { field: 'groupId' });
  }
  const subgroup = query.subgroup ?? (query.groupId ? null : (req.user?.subgroup ?? null));

  const group = await prisma.studyGroup.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, studyYear: true, facultyId: true, subgroups: true },
  });
  if (!group || group.facultyId !== config.facultyId) throw notFound('Grupa nu există');

  const term = query.termId ? await termById(query.termId) : await currentTerm(config.facultyId);
  const days = await weekForGroup(term.id, group.id, subgroup);

  res.json({
    data: {
      term: { id: term.id, academicYear: term.academicYear, semester: term.semester },
      group: { id: group.id, name: group.name, studyYear: group.studyYear },
      subgroup,
      days,
    },
  });
});

const changesQuery = { query: z.object({ groupId: z.coerce.number().int().positive().optional() }) };

// what the last import did so nobody has to read the logs
scheduleRouter.get('/schedule/status', validate(changesQuery), async (req, res) => {
  const { query } = valid<typeof changesQuery>(req);
  const groupId = query.groupId ?? req.user?.groupId ?? null;
  res.json({
    data: {
      lastRun: await lastRun(config.facultyId),
      changes: groupId ? await recentChanges(groupId, 20) : [],
    },
  });
});

const importBody = { body: z.object({ termId: z.coerce.number().int().positive().optional() }) };

// the n0 path it works with no scraper at all
scheduleRouter.post(
  '/schedule/import',
  requireRole('admin'),
  importLimiter,
  upload.single('file'),
  validate(importBody),
  async (req, res) => {
    const { body } = valid<typeof importBody>(req);
    if (!req.file) throw badRequest('Trimite un fișier CSV în câmpul „file”', { field: 'file' });

    const term = body.termId ? await termById(body.termId) : await currentTerm(config.facultyId);
    const adapter = adapterFor(req.file);
    const report = await runImport(term, adapter, 'import');

    res.status(report.status === 'failed' ? 422 : 200).json({ data: report });
  },
);

function adapterFor(file: Express.Multer.File) {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.csv')) return ManualAdapter.fromBuffer(file.buffer, file.originalname);
  throw badRequest('Acceptăm doar fișiere .csv', { field: 'file' });
}
