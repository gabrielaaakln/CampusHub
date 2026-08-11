import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { norm, normCompact } from '@campushub/shared';
import { prisma } from '../src/lib/db.js';
import { ManualAdapter } from '../src/modules/schedule/adapters/manual.js';
import { runImport } from '../src/modules/schedule/importer.js';
import type { TermRef } from '../src/modules/schedule/types.js';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/schedule/${name}`, import.meta.url)));

const dbUp = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => false);

if (!dbUp) console.warn('skipping schedule tests: no database at DATABASE_URL');

describe.skipIf(!dbUp)('schedule importer', () => {
  let term: TermRef;
  let groupIds: number[];

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE faculties, users, scrape_runs, schedule_changes, notifications RESTART IDENTITY CASCADE',
    );

    const faculty = await prisma.faculty.create({ data: { name: 'Test', shortName: 'TST' } });
    const created = await prisma.academicTerm.create({
      data: {
        facultyId: faculty.id,
        academicYear: '2026-2027',
        semester: 1,
        startsOn: new Date('2026-10-05'),
        endsOn: new Date('2027-01-29'),
        isCurrent: true,
      },
    });
    term = {
      id: created.id,
      facultyId: faculty.id,
      academicYear: created.academicYear,
      semester: created.semester,
    };

    const groups = await Promise.all(
      ['CTI 3A', 'CTI 3B', 'AIA 2A'].map((name) =>
        prisma.studyGroup.create({
          data: { facultyId: faculty.id, name, nameNorm: norm(name), studyYear: 3 },
        }),
      ),
    );
    groupIds = groups.map((g) => g.id);

    await prisma.subject.create({
      data: {
        facultyId: faculty.id,
        name: 'Rețele de Calculatoare',
        nameNorm: norm('Rețele de Calculatoare'),
      },
    });

    const building = await prisma.building.create({
      data: {
        facultyId: faculty.id,
        name: 'Corp A',
        floors: { create: [{ level: 1, label: 'Etaj 1' }] },
      },
      include: { floors: true },
    });
    await prisma.room.create({
      data: {
        floorId: building.floors[0]!.id,
        roomNumber: 'A107',
        roomNumberNorm: normCompact('A107'),
        directions: 'Corp A, etaj 1, pe stânga după scări',
      },
    });

    await prisma.user.create({
      data: {
        displayName: 'Student Test',
        email: 'student.test@student.tuiasi.ro',
        passwordHash: 'x',
        facultyId: faculty.id,
        groupId: groupIds[0]!,
        subgroup: 1,
      },
    });
  });

  it('imports the fixture and records the run', async () => {
    const report = await runImport(term, ManualAdapter.fromBuffer(fixture('tuiasi-ac-sem1.csv')), 'manual');

    expect(report.status).toBe('success');
    expect(report.found).toBe(40);
    expect(report.added).toBe(40);
    expect(report.changed).toBe(0);

    const active = await prisma.scheduleEntry.count({ where: { termId: term.id, isActive: true } });
    expect(active).toBe(40);
  });

  it('resolves the subject and the room that exist', async () => {
    const entry = await prisma.scheduleEntry.findFirstOrThrow({
      where: { termId: term.id, roomRaw: 'A107' },
      include: { subject: true, room: true },
    });
    expect(entry.subject?.name).toBe('Rețele de Calculatoare');
    expect(entry.room?.roomNumber).toBe('A107');
  });

  it('reports subjects it could not resolve without failing', async () => {
    const run = await prisma.scrapeRun.findFirstOrThrow({ orderBy: { startedAt: 'desc' } });
    expect(run.status).toBe('success');
    const unresolved = await prisma.scheduleEntry.count({
      where: { termId: term.id, subjectId: null },
    });
    expect(unresolved).toBeGreaterThan(0);
  });

  it('detects a changed room, a moved slot and a dropped hour on the second import', async () => {
    const report = await runImport(
      term,
      ManualAdapter.fromBuffer(fixture('tuiasi-ac-sem1-modificat.csv')),
      'import',
    );

    expect(report.changed).toBe(1);
    expect(report.added).toBe(1);
    expect(report.removed).toBe(2);

    const changes = await prisma.scheduleChange.findMany({ where: { runId: report.runId } });
    const changed = changes.find((c) => c.kind === 'changed');
    const before = changed?.before as { room?: string } | undefined;
    const after = changed?.after as { room?: string } | undefined;
    expect(before?.room).toBe('A201');
    expect(after?.room).toBe('A204');
  });

  it('notifies once per run and not once per changed row', async () => {
    const notifications = await prisma.notification.findMany({ where: { type: 'schedule_changed' } });
    // two runs touched this student's group, 40 rows moved in total
    expect(notifications).toHaveLength(2);
    expect(notifications[0]?.link).toBe('/orar');
  });

  it('deactivates instead of deleting so history survives', async () => {
    const gone = await prisma.scheduleEntry.findMany({
      where: { termId: term.id, isActive: false },
    });
    expect(gone).toHaveLength(2);
    expect(gone[0]?.deactivatedAt).not.toBeNull();
  });

  it('keeps everything when the source returns nothing', async () => {
    const before = await prisma.scheduleEntry.count({ where: { termId: term.id, isActive: true } });
    const report = await runImport(
      term,
      ManualAdapter.fromBuffer(Buffer.from('group,subgroup,day,start,end,type,parity,subject\n')),
      'import',
    );

    expect(report.status).toBe('failed');
    const after = await prisma.scheduleEntry.count({ where: { termId: term.id, isActive: true } });
    expect(after).toBe(before);
  });

  it('trips the safety valve instead of wiping the semester', async () => {
    const header = 'group,subgroup,day,start,end,type,parity,subject,room,professor\n';
    const oneRow = 'CTI 3A,0,luni,08:00,10:00,curs,ambele,Programarea Calculatoarelor,A204,X\n';

    const before = await prisma.scheduleEntry.count({ where: { termId: term.id, isActive: true } });
    const report = await runImport(
      term,
      ManualAdapter.fromBuffer(Buffer.from(header + oneRow)),
      'scraper',
    );

    expect(report.status).toBe('partial');
    expect(report.removed).toBe(0);
    expect(report.errors.join(' ')).toContain('supapa de siguranță');

    const after = await prisma.scheduleEntry.count({ where: { termId: term.id, isActive: true } });
    expect(after).toBe(before);
  });
});
