import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/lib/db.js';

const dbUp = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => false);

if (!dbUp) console.warn('skipping deadline tests: no database at DATABASE_URL');

describe.skipIf(!dbUp)('deadlines', () => {
  const app = createApp();
  const agent = request.agent(app);
  let csrf = '';
  const author = 'deadline.author@student.tuiasi.ro';
  const colleague = 'deadline.colleague@student.tuiasi.ro';
  const stranger = 'deadline.stranger@student.tuiasi.ro';
  const moderator = 'deadline.moderator@tuiasi.ro';
  let groupId = 0;
  let otherGroupId = 0;
  let deadlineId = 0;

  // the dev header picks the user the csrf token belongs to the shared session
  const as = (email: string) => ({ 'x-dev-user': email, 'x-csrf-token': csrf });

  const inDays = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  };

  beforeAll(async () => {
    csrf = (await agent.get('/api/v1/csrf').expect(200)).body.data.token;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE faculties, users RESTART IDENTITY CASCADE');
    await prisma.$executeRaw`
      INSERT INTO faculties (id, name, short_name) VALUES (${config.facultyId}, 'Test', 'TST')`;
    await prisma.$executeRaw`SELECT setval('faculties_id_seq', ${config.facultyId})`;

    const group = await prisma.studyGroup.create({
      data: { facultyId: config.facultyId, name: '1306', nameNorm: '1306', studyYear: 3 },
    });
    groupId = group.id;
    const other = await prisma.studyGroup.create({
      data: { facultyId: config.facultyId, name: '1401', nameNorm: '1401', studyYear: 4 },
    });
    otherGroupId = other.id;

    for (const [email, id, role] of [
      [author, groupId, 'student'],
      [colleague, groupId, 'student'],
      [stranger, otherGroupId, 'student'],
      [moderator, groupId, 'moderator'],
    ] as const) {
      await prisma.user.create({
        data: {
          displayName: email.split('.')[1]!,
          email,
          passwordHash: 'x',
          role,
          facultyId: config.facultyId,
          groupId: id,
          subgroup: 1,
        },
      });
    }
  });

  it('refuses to write a deadline without an account', async () => {
    await agent
      .post('/api/v1/deadlines')
      .set('x-csrf-token', csrf)
      .send({ title: 'Tema 1', dueAt: inDays(3) })
      .expect(401);
  });

  it('writes a deadline for the group of the author', async () => {
    const res = await agent
      .post('/api/v1/deadlines')
      .set(as(author))
      .send({ title: 'Tema 2 la Programare web', type: 'tema', dueAt: inDays(3) })
      .expect(201);

    deadlineId = res.body.data.id;
    expect(res.body.data.group.name).toBe('1306');
    expect(res.body.data.isMine).toBe(true);
  });

  it('shows it to a colleague from the same group', async () => {
    const list = await agent.get('/api/v1/deadlines').set(as(colleague)).expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].isMine).toBe(false);
  });

  it('hides it from another group', async () => {
    const list = await agent.get('/api/v1/deadlines').set(as(stranger)).expect(200);
    expect(list.body.meta.total).toBe(0);
  });

  it('lets only a moderator write for the whole faculty', async () => {
    await agent
      .post('/api/v1/deadlines')
      .set(as(author))
      .send({ title: 'Sesiunea începe', dueAt: inDays(20), groupId: null })
      .expect(403);

    await agent
      .post('/api/v1/deadlines')
      .set(as(moderator))
      .send({ title: 'Sesiunea începe', type: 'examen', dueAt: inDays(20), groupId: null })
      .expect(201);

    // a deadline without a group reaches every group
    const list = await agent.get('/api/v1/deadlines').set(as(stranger)).expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].group).toBeNull();
  });

  it('leaves out what has already passed', async () => {
    await prisma.deadline.create({
      data: {
        facultyId: config.facultyId,
        groupId,
        title: 'Termen trecut',
        dueAt: new Date(Date.now() - 5 * 86_400_000),
      },
    });

    const list = await agent.get('/api/v1/deadlines').set(as(author)).expect(200);
    expect(list.body.data.some((d: { title: string }) => d.title === 'Termen trecut')).toBe(false);
  });

  it('refuses to edit somebody else deadline', async () => {
    const res = await agent
      .patch(`/api/v1/deadlines/${deadlineId}`)
      .set(as(colleague))
      .send({ title: 'Altceva' })
      .expect(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('lets the author move the date', async () => {
    const res = await agent
      .patch(`/api/v1/deadlines/${deadlineId}`)
      .set(as(author))
      .send({ dueAt: inDays(6) })
      .expect(200);
    expect(Date.parse(res.body.data.dueAt)).toBeGreaterThan(Date.now());
  });

  it('appears in the calendar of the group', async () => {
    const day = (offset: number) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return date.toISOString().slice(0, 10);
    };

    const calendar = await agent
      .get(`/api/v1/me/calendar?from=${day(0)}&to=${day(10)}`)
      .set(as(colleague))
      .expect(200);

    const ids = calendar.body.data.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(`deadline:${deadlineId}`);
  });

  it('deletes logically', async () => {
    await agent.delete(`/api/v1/deadlines/${deadlineId}`).set(as(author)).expect(204);
    const row = await prisma.deadline.findUniqueOrThrow({ where: { id: deadlineId } });
    expect(row.isDeleted).toBe(true);

    const list = await agent.get('/api/v1/deadlines').set(as(author)).expect(200);
    expect(list.body.data.some((d: { id: number }) => d.id === deadlineId)).toBe(false);
  });
});
