import { Router } from 'express';
import { prisma } from '../../lib/db.js';

export const healthRouter: Router = Router();

// answers for the database too not just the process
healthRouter.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      version: process.env.TAG ?? 'dev',
    });
  } catch {
    res.status(503).json({ status: 'degraded' });
  }
});
