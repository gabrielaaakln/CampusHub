import { Router } from 'express';
import { idParam, notificationQuery, type NotificationDto } from '@campushub/shared';
import { prisma } from '../../lib/db.js';
import { notFound } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { valid, validate } from '../../middleware/validate.js';

export const notificationsRouter: Router = Router();

const listSchemas = { query: notificationQuery };

// n0 is polling the client asks every 60s and that is the whole feature
notificationsRouter.get('/notifications', requireAuth, validate(listSchemas), async (req, res) => {
  const { query } = valid<typeof listSchemas>(req);
  const userId = req.user!.id;
  const where = { userId, ...(query.unread === 'true' ? { isRead: false } : {}) };

  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  const data: NotificationDto[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
  }));

  res.json({
    data,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      has_next: query.page * query.limit < total,
      unread,
    },
  });
});

notificationsRouter.patch(
  '/notifications/:id/read',
  requireAuth,
  validate({ params: idParam }),
  async (req, res) => {
    const { params } = valid<{ params: typeof idParam }>(req);
    // the where clause carries the owner so one user cannot read another one notifications
    const done = await prisma.notification.updateMany({
      where: { id: params.id, userId: req.user!.id },
      data: { isRead: true },
    });
    if (done.count === 0) throw notFound('Notificarea nu există');
    res.status(204).end();
  },
);

notificationsRouter.patch('/notifications/read-all', requireAuth, async (req, res) => {
  const done = await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true },
  });
  res.json({ data: { marked: done.count } });
});
