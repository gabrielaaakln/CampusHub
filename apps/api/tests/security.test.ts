import argon2 from 'argon2';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/lib/db.js';

const dbUp = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => false);

if (!dbUp) console.warn('skipping security tests: no database at DATABASE_URL');

const PASSWORD = 'parola-de-test-123';

/** the cookie a browser would send back read out of a set-cookie header */
function cookiesFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).map((c) => c.split(';')[0]).join('; ');
}

function sidFrom(cookie: string): string | null {
  const found = /ch\.sid=([^;]*)/.exec(cookie);
  return found?.[1] ?? null;
}

describe.skipIf(!dbUp)('security', () => {
  const app = createApp();
  const student = 'sec.student@student.tuiasi.ro';
  const other = 'sec.other@student.tuiasi.ro';
  const admin = 'sec.admin@tuiasi.ro';
  let otherNotificationId = 0;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE faculties, users, user_sessions RESTART IDENTITY CASCADE',
    );
    await prisma.$executeRaw`
      INSERT INTO faculties (id, name, short_name) VALUES (${config.facultyId}, 'Test', 'TST')`;
    await prisma.$executeRaw`SELECT setval('faculties_id_seq', ${config.facultyId})`;

    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    for (const [email, role] of [
      [student, 'student'],
      [other, 'student'],
      [admin, 'admin'],
    ] as const) {
      await prisma.user.create({
        data: {
          displayName: email.split('@')[0]!,
          email,
          passwordHash,
          role,
          facultyId: config.facultyId,
        },
      });
    }

    const otherRow = await prisma.user.findUniqueOrThrow({ where: { email: other } });
    const notification = await prisma.notification.create({
      data: { userId: otherRow.id, type: 'system', title: 'Doar pentru celălalt' },
    });
    otherNotificationId = notification.id;
  });

  describe('sessions', () => {
    it('hands out a new session id at login so a planted one is worthless', async () => {
      const agent = request.agent(app);
      const csrfRes = await agent.get('/api/v1/csrf').expect(200);
      const before = sidFrom(cookiesFrom(csrfRes));

      const login = await agent
        .post('/api/v1/auth/login')
        .set('x-csrf-token', csrfRes.body.data.token)
        .send({ email: student, password: PASSWORD })
        .expect(200);

      const after = sidFrom(cookiesFrom(login));
      expect(before).toBeTruthy();
      expect(after).toBeTruthy();
      expect(after).not.toBe(before);
    });

    it('kills the old cookie at logout instead of only forgetting it in the browser', async () => {
      const agent = request.agent(app);
      const csrf = (await agent.get('/api/v1/csrf').expect(200)).body.data.token;
      const login = await agent
        .post('/api/v1/auth/login')
        .set('x-csrf-token', csrf)
        .send({ email: student, password: PASSWORD })
        .expect(200);

      // what an attacker would have copied while the session was alive
      const stolen = cookiesFrom(login);
      expect((await request(app).get('/api/v1/auth/me').set('Cookie', stolen)).body.data).not.toBeNull();

      // the token from before the login is bound to the session id that login threw away
      await agent.post('/api/v1/auth/logout').set('x-csrf-token', csrf).expect(403);

      const fresh = (await agent.get('/api/v1/csrf').expect(200)).body.data.token;
      await agent.post('/api/v1/auth/logout').set('x-csrf-token', fresh).expect(204);

      const replay = await request(app).get('/api/v1/auth/me').set('Cookie', stolen).expect(200);
      expect(replay.body.data).toBeNull();

      const rows = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) FROM user_sessions WHERE sid = ${sidFrom(stolen)?.replace(/^s%3A/, '').split('.')[0]}`;
      expect(Number(rows[0]?.count ?? 0)).toBe(0);
    });

    it('drops the session when the account behind it is banned', async () => {
      const agent = request.agent(app);
      const csrf = (await agent.get('/api/v1/csrf').expect(200)).body.data.token;
      await agent
        .post('/api/v1/auth/login')
        .set('x-csrf-token', csrf)
        .send({ email: other, password: PASSWORD })
        .expect(200);

      await prisma.user.update({ where: { email: other }, data: { isBanned: true } });
      const after = await agent.get('/api/v1/auth/me').expect(200);
      expect(after.body.data).toBeNull();

      await prisma.user.update({ where: { email: other }, data: { isBanned: false } });
    });
  });

  describe('authorisation', () => {
    it('refuses the schedule import to anonymous callers', async () => {
      const agent = request.agent(app);
      const csrf = (await agent.get('/api/v1/csrf').expect(200)).body.data.token;
      await agent.post('/api/v1/schedule/import').set('x-csrf-token', csrf).expect(401);
    });

    it('refuses the schedule import to a student', async () => {
      const agent = request.agent(app);
      const csrf = (await agent.get('/api/v1/csrf').expect(200)).body.data.token;
      await agent
        .post('/api/v1/schedule/import')
        .set({ 'x-dev-user': student, 'x-csrf-token': csrf })
        .expect(403);
    });

    it('lets the admin through to the same route', async () => {
      const agent = request.agent(app);
      const csrf = (await agent.get('/api/v1/csrf').expect(200)).body.data.token;
      // 422 is the body failing validation which means the role gate had already let it through
      await agent
        .post('/api/v1/schedule/import')
        .set({ 'x-dev-user': admin, 'x-csrf-token': csrf })
        .expect(422);
    });

    it('keeps the moderation queue away from students and anonymous callers', async () => {
      const agent = request.agent(app);
      await agent.get('/api/v1/moderation/reports').expect(401);
      await agent.get('/api/v1/moderation/reports').set('x-dev-user', student).expect(403);
      await agent.get('/api/v1/moderation/reports').set('x-dev-user', admin).expect(200);
    });

    it('does not let one student mark another student notification as read', async () => {
      const agent = request.agent(app);
      const csrf = (await agent.get('/api/v1/csrf').expect(200)).body.data.token;
      await agent
        .patch(`/api/v1/notifications/${otherNotificationId}/read`)
        .set({ 'x-dev-user': student, 'x-csrf-token': csrf })
        .expect(404);

      const row = await prisma.notification.findUniqueOrThrow({
        where: { id: otherNotificationId },
      });
      expect(row.isRead).toBe(false);
    });
  });

  describe('csrf', () => {
    it('rejects a state changing call with no token even with a valid session', async () => {
      const agent = request.agent(app);
      await agent.get('/api/v1/csrf').expect(200);
      await agent
        .post('/api/v1/forum/posts')
        .set('x-dev-user', student)
        .send({ categoryId: 1, title: 'Fara token', content: 'x' })
        .expect(403);
    });

    it('rejects a token that belongs to another session', async () => {
      const mine = request.agent(app);
      const theirs = request.agent(app);
      await mine.get('/api/v1/csrf').expect(200);
      const foreign = (await theirs.get('/api/v1/csrf').expect(200)).body.data.token;

      await mine
        .post('/api/v1/forum/posts')
        .set({ 'x-dev-user': student, 'x-csrf-token': foreign })
        .send({ categoryId: 1, title: 'Token strain', content: 'x' })
        .expect(403);
    });
  });

  describe('accounts', () => {
    it('answers the same for a wrong password and for an account that does not exist', async () => {
      const agent = request.agent(app);
      const csrf = (await agent.get('/api/v1/csrf').expect(200)).body.data.token;

      const wrong = await agent
        .post('/api/v1/auth/login')
        .set('x-csrf-token', csrf)
        .send({ email: student, password: 'gresita-dar-lunga' })
        .expect(401);
      const missing = await agent
        .post('/api/v1/auth/login')
        .set('x-csrf-token', csrf)
        .send({ email: 'nimeni@student.tuiasi.ro', password: 'gresita-dar-lunga' })
        .expect(401);

      expect(wrong.body.error.message).toBe(missing.body.error.message);
    });

    it('never serialises an email address into the session user of someone else', async () => {
      const agent = request.agent(app);
      const posts = await agent.get('/api/v1/forum/posts').expect(200);
      expect(JSON.stringify(posts.body)).not.toContain('@student.tuiasi.ro');
    });
  });
});
