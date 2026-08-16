import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { norm } from '@campushub/shared';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/lib/db.js';
import { timeOfDay } from '../src/modules/schedule/resolve.js';

const dbUp = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => false);

if (!dbUp) console.warn('skipping calendar tests: no database at DATABASE_URL');

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe.skipIf(!dbUp)('calendar', () => {
  const app = createApp();
  const email = 'calendar.student@student.tuiasi.ro';

  beforeAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE faculties, users RESTART IDENTITY CASCADE');
    await prisma.$executeRaw`
      INSERT INTO faculties (id, name, short_name, timezone)
      VALUES (${config.facultyId}, 'Test', 'TST', 'Europe/Bucharest')`;
    await prisma.$executeRaw`SELECT setval('faculties_id_seq', ${config.facultyId})`;

    const term = await prisma.academicTerm.create({
      data: {
        facultyId: config.facultyId,
        academicYear: '2026-2027',
        semester: 1,
        startsOn: day('2026-10-05'),
        endsOn: day('2027-01-29'),
        firstWeekParity: 'impar',
        isCurrent: true,
        breaks: {
          create: [{ kind: 'vacanta', label: 'Test', startsOn: day('2026-10-19'), endsOn: day('2026-10-25') }],
        },
      },
    });

    const group = await prisma.studyGroup.create({
      data: { facultyId: config.facultyId, name: '1306', nameNorm: norm('1306'), studyYear: 3 },
    });

    const subject = await prisma.subject.create({
      data: {
        facultyId: config.facultyId,
        name: 'Ingineria programării',
        nameNorm: norm('Ingineria programării'),
      },
    });

    await prisma.scheduleEntry.createMany({
      data: [
        {
          termId: term.id,
          groupId: group.id,
          subgroup: 0,
          dayOfWeek: 'luni',
          startTime: timeOfDay('10:00'),
          endTime: timeOfDay('12:00'),
          classType: 'curs',
          parity: 'ambele',
          subjectId: subject.id,
          subjectRaw: 'Ingineria programării',
          contentHash: 'a',
        },
        {
          termId: term.id,
          groupId: group.id,
          subgroup: 1,
          dayOfWeek: 'luni',
          startTime: timeOfDay('12:00'),
          endTime: timeOfDay('14:00'),
          classType: 'laborator',
          parity: 'ambele',
          startsWeek: 3,
          subjectId: subject.id,
          subjectRaw: 'Ingineria programării',
          contentHash: 'b',
        },
        {
          termId: term.id,
          groupId: group.id,
          subgroup: 2,
          dayOfWeek: 'luni',
          startTime: timeOfDay('14:00'),
          endTime: timeOfDay('16:00'),
          classType: 'laborator',
          parity: 'ambele',
          subjectId: subject.id,
          subjectRaw: 'Ingineria programării',
          contentHash: 'c',
        },
      ],
    });

    await prisma.deadline.create({
      data: {
        facultyId: config.facultyId,
        groupId: group.id,
        title: 'Tema 1',
        type: 'tema',
        dueAt: new Date('2026-10-07T20:59:00.000Z'),
      },
    });

    await prisma.event.create({
      data: {
        facultyId: config.facultyId,
        title: 'Hackathon',
        startsAt: new Date('2026-10-08T07:00:00.000Z'),
        endsAt: new Date('2026-10-08T13:00:00.000Z'),
      },
    });

    await prisma.user.create({
      data: {
        displayName: 'Student Calendar',
        email,
        passwordHash: 'x',
        facultyId: config.facultyId,
        groupId: group.id,
        subgroup: 1,
      },
    });
  });

  const week = (from: string, to: string) =>
    request(app).get(`/api/v1/me/calendar?from=${from}&to=${to}`).set('x-dev-user', email);

  const hoursOf = (res: { body: { data: { items: { kind: string; startsAt: string }[] } } }) =>
    res.body.data.items
      .filter((i) => i.kind === 'class')
      .map((i) => i.startsAt.slice(11, 16));

  it('needs an account', async () => {
    const res = await request(app)
      .get('/api/v1/me/calendar?from=2026-10-05&to=2026-10-11')
      .expect(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('puts classes, deadlines and events in one list with the faculty offset', async () => {
    const res = await week('2026-10-05', '2026-10-11').expect(200);
    const kinds = res.body.data.items.map((i: { kind: string }) => i.kind);

    expect(kinds).toContain('class');
    expect(kinds).toContain('deadline');
    expect(kinds).toContain('event');
    for (const item of res.body.data.items) {
      expect(item.startsAt).toMatch(/[+-]\d{2}:\d{2}$/);
    }
  });

  it('shows only the subgroup of the student plus the whole group', async () => {
    // the 14:00 lab belongs to the other subgroup and never shows up
    const first = await week('2026-10-05', '2026-10-11').expect(200);
    expect(hoursOf(first)).toEqual(['10:00']);

    const third = await week('2026-10-19', '2026-11-01').expect(200);
    expect(hoursOf(third)).toEqual(['10:00', '12:00']);
  });

  it('labels the week with its index and parity', async () => {
    const res = await week('2026-10-12', '2026-10-18').expect(200);
    expect(res.body.data.weeks).toEqual([
      { index: 2, parity: 'par', startsOn: '2026-10-12', endsOn: '2026-10-18' },
    ]);
  });

  it('leaves the break week empty', async () => {
    const res = await week('2026-10-19', '2026-10-25').expect(200);
    expect(res.body.data.items).toEqual([]);
  });

  it('starts a class that begins mid semester at its own week', async () => {
    const first = await week('2026-10-05', '2026-10-11').expect(200);
    const third = await week('2026-10-26', '2026-11-01').expect(200);

    const labs = (res: { body: { data: { items: { type: string }[] } } }) =>
      res.body.data.items.filter((i) => i.type === 'laborator');

    expect(labs(first)).toHaveLength(0);
    expect(labs(third)).toHaveLength(1);
  });

  it('refuses a range that is longer than two months', async () => {
    const res = await week('2026-10-05', '2027-01-05').expect(422);
    expect(res.body.error.code).toBe('validation_failed');
  });
});
