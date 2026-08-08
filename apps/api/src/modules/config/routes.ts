import { Router } from 'express';
import type { AppConfig } from '@campushub/shared';
import { config } from '../../config.js';
import { prisma } from '../../lib/db.js';

export const configRouter: Router = Router();

let cached: AppConfig['faculty'] | undefined;

// public no auth the frontend reads this once at boot and hides what is off
configRouter.get('/config', async (_req, res) => {
  if (cached === undefined) {
    const faculty = await prisma.faculty.findUnique({
      where: { id: config.facultyId },
      select: { id: true, shortName: true, name: true, timezone: true },
    });
    cached = faculty ?? null;
  }
  const body: AppConfig = { features: config.features, faculty: cached };
  res.json(body);
});

export function resetConfigCache(): void {
  cached = undefined;
}
