import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/lib/db.js';

const dbUp = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => false);

if (!dbUp) console.warn('skipping notification tests: no database at DATABASE_URL');

describe.skipIf(!dbUp)('notifications', () => {
  const app = createApp();
  const agent = request.agent(app);
  let csrf = '';
  const mine = 'notif.mine@student.tuiasi.ro';
  const other = 'notif.other@student.tuiasi.ro';
  let firstId = 0;

  // the dev header picks the user the csrf token belongs to the shared session
  const as = (email: string) => ({ 'x-dev-user': email, 'x-csrf-token': csrf });

  beforeAll(async () => {
    csrf = (await agent.get('/api/v1/csrf').expect(200)).body.data.token;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE faculties, users RESTART IDENTITY CASCADE');
    await prisma.$executeRaw`
      INSERT INTO faculties (id, name, short_name) VALUES (${config.facultyId}, 'Test', 'TST')`;
    await prisma.$executeRaw`SELECT setval('faculties_id_seq', ${config.facultyId})`;

    const users = await Promise.all(
      [mine, other].map((email) =>
        prisma.user.create({
          data: {
            displayName: email.split('.')[0]!,
            email,
            passwordHash: 'x',
            facultyId: config.facultyId,
          },
        }),
      ),
    );

    await prisma.notification.createMany({
      data: [
        {
          userId: users[0]!.id,
          type: 'schedule_changed',
          title: 'Orarul grupei tale s-a schimbat',
          link: '/orar',
        },
        { userId: users[0]!.id, type: 'schedule_changed', title: 'A doua', link: '/orar' },
        { userId: users[1]!.id, type: 'schedule_changed', title: 'A altcuiva', link: '/orar' },
      ],
    });

    firstId = (await prisma.notification.findFirstOrThrow({
      where: { userId: users[0]!.id },
      orderBy: { id: 'asc' },
    })).id;
  });

  it('needs an account', async () => {
    await agent.get('/api/v1/notifications').expect(401);
  });

  it('lists only your own, newest first, with the unread count', async () => {
    const res = await agent.get('/api/v1/notifications').set(as(mine)).expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.unread).toBe(2);
    expect(res.body.data.every((n: { title: string }) => n.title !== 'A altcuiva')).toBe(true);
  });

  it('marks one as read', async () => {
    await agent.patch(`/api/v1/notifications/${firstId}/read`).set(as(mine)).expect(204);

    const res = await agent.get('/api/v1/notifications').set(as(mine)).expect(200);
    expect(res.body.meta.unread).toBe(1);
  });

  it('refuses to mark somebody else notification as read', async () => {
    const theirs = await prisma.notification.findFirstOrThrow({ where: { title: 'A altcuiva' } });
    const res = await agent
      .patch(`/api/v1/notifications/${theirs.id}/read`)
      .set(as(mine))
      .expect(404);
    expect(res.body.error.code).toBe('not_found');

    const untouched = await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(untouched.isRead).toBe(false);
  });

  it('marks everything as read at once', async () => {
    const res = await agent.patch('/api/v1/notifications/read-all').set(as(mine)).expect(200);
    expect(res.body.data.marked).toBe(1);

    const after = await agent.get('/api/v1/notifications').set(as(mine)).expect(200);
    expect(after.body.meta.unread).toBe(0);
  });

  it('filters the unread ones', async () => {
    const res = await agent
      .get('/api/v1/notifications?unread=true')
      .set(as(mine))
      .expect(200);
    expect(res.body.data).toEqual([]);
  });
});
