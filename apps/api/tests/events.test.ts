import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/lib/db.js';

const dbUp = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => false);

if (!dbUp) console.warn('skipping events tests: no database at DATABASE_URL');

describe.skipIf(!dbUp)('events', () => {
  const app = createApp();
  const agent = request.agent(app);
  let csrf = '';
  const moderator = 'events.moderator@tuiasi.ro';
  const student = 'events.student@student.tuiasi.ro';
  let eventId = 0;
  let roomId = 0;

  // the dev header picks the user the csrf token belongs to the shared session
  const as = (email: string) => ({ 'x-dev-user': email, 'x-csrf-token': csrf });

  const inDays = (days: number, hour: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  };

  beforeAll(async () => {
    csrf = (await agent.get('/api/v1/csrf').expect(200)).body.data.token;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE faculties, users RESTART IDENTITY CASCADE');
    await prisma.$executeRaw`
      INSERT INTO faculties (id, name, short_name) VALUES (${config.facultyId}, 'Test', 'TST')`;
    await prisma.$executeRaw`SELECT setval('faculties_id_seq', ${config.facultyId})`;

    const building = await prisma.building.create({
      data: { facultyId: config.facultyId, name: 'Corp AC', code: 'AC' },
    });
    const floor = await prisma.floor.create({ data: { buildingId: building.id, level: 0 } });
    const room = await prisma.room.create({
      data: { floorId: floor.id, roomNumber: 'AC1-1', roomNumberNorm: 'ac11' },
    });
    roomId = room.id;

    await prisma.user.create({
      data: {
        displayName: 'Moderator',
        email: moderator,
        passwordHash: 'x',
        role: 'moderator',
        facultyId: config.facultyId,
      },
    });
    await prisma.user.create({
      data: {
        displayName: 'Student',
        email: student,
        passwordHash: 'x',
        facultyId: config.facultyId,
      },
    });
  });

  it('refuses to publish an event as a student', async () => {
    const res = await agent
      .post('/api/v1/events')
      .set(as(student))
      .send({ title: 'Petrecere în amfiteatru', startsAt: inDays(3, 18) })
      .expect(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('rejects an event that ends before it starts', async () => {
    const res = await agent
      .post('/api/v1/events')
      .set(as(moderator))
      .send({ title: 'Târg de practică', startsAt: inDays(3, 18), endsAt: inDays(3, 9) })
      .expect(422);
    expect(res.body.error.code).toBe('validation_failed');
  });

  it('publishes an event in a real room', async () => {
    const res = await agent
      .post('/api/v1/events')
      .set(as(moderator))
      .send({
        title: 'Târg de practică și internship',
        description: 'Firme din Iași.',
        roomId,
        startsAt: inDays(3, 10),
        endsAt: inDays(3, 16),
      })
      .expect(201);

    eventId = res.body.data.id;
    expect(res.body.data.room.number).toBe('AC1-1');
    expect(res.body.data.attendeeCount).toBe(0);
    expect(res.body.data.isAttending).toBe(false);
  });

  it('leaves out events that have already passed', async () => {
    await prisma.event.create({
      data: {
        facultyId: config.facultyId,
        title: 'Eveniment de anul trecut',
        startsAt: new Date(Date.now() - 40 * 86_400_000),
      },
    });

    const list = await agent.get('/api/v1/events').expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].id).toBe(eventId);
  });

  it('signs a student up and counts the attendance once', async () => {
    const first = await agent
      .post(`/api/v1/events/${eventId}/attend`)
      .set(as(student))
      .expect(200);
    expect(first.body.data.isAttending).toBe(true);
    expect(first.body.data.attendeeCount).toBe(1);

    const again = await agent
      .post(`/api/v1/events/${eventId}/attend`)
      .set(as(student))
      .expect(200);
    expect(again.body.data.attendeeCount).toBe(1);
  });

  it('filters down to the events i signed up for', async () => {
    await agent
      .post('/api/v1/events')
      .set(as(moderator))
      .send({ title: 'Seară de robotică', startsAt: inDays(6, 18) })
      .expect(201);

    const mine = await agent.get('/api/v1/events?mine=true').set(as(student)).expect(200);
    expect(mine.body.meta.total).toBe(1);
    expect(mine.body.data[0].id).toBe(eventId);
  });

  it('shows the event in the calendar of the same student', async () => {
    const from = new Date();
    const to = new Date(Date.now() + 10 * 86_400_000);
    const day = (d: Date) => d.toISOString().slice(0, 10);

    const calendar = await agent
      .get(`/api/v1/me/calendar?from=${day(from)}&to=${day(to)}`)
      .set(as(student))
      .expect(200);

    const ids = calendar.body.data.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(`event:${eventId}`);
  });

  it('lets the student withdraw', async () => {
    const res = await agent
      .delete(`/api/v1/events/${eventId}/attend`)
      .set(as(student))
      .expect(200);
    expect(res.body.data.isAttending).toBe(false);
    expect(res.body.data.attendeeCount).toBe(0);
  });

  it('deletes logically and stops listing the event', async () => {
    await agent.delete(`/api/v1/events/${eventId}`).set(as(moderator)).expect(204);

    const gone = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(gone.isDeleted).toBe(true);

    await agent.get(`/api/v1/events/${eventId}`).expect(404);
  });

  it('never exposes an email address', async () => {
    const list = await agent.get('/api/v1/events').expect(200);
    expect(JSON.stringify(list.body)).not.toContain('@tuiasi.ro');
  });
});
