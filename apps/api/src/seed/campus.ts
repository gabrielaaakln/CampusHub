import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DateTime } from 'luxon';
import { norm, normCompact } from '@campushub/shared';
import { prisma } from '../lib/db.js';
import { readCampusPlan, floorLabel, type CampusPlan } from './workbook.js';

const TIMEZONE = 'Europe/Bucharest';

export const WORKBOOK = new URL(
  '../../../../fixtures/schedule/real/orar-ac-2025-2026-sem2.xlsx',
  import.meta.url,
);

// a term that ended last winter shows an empty week on demo day
// default is a semester anchored four weeks back SEED_TERM_START overrides it
function termStart(): DateTime {
  const override = process.env.SEED_TERM_START;
  if (override) return DateTime.fromISO(override, { zone: TIMEZONE }).startOf('day');
  return DateTime.now().setZone(TIMEZONE).startOf('week').minus({ weeks: 4 });
}

// a date column keeps the utc calendar day so writing local midnight lands a day early
const dateOnly = (d: DateTime): Date => new Date(`${d.toISODate() ?? ''}T00:00:00.000Z`);

function academicYearOf(d: DateTime): { year: string; semester: number } {
  const inFirstSemester = d.month >= 9 || d.month === 1;
  const startYear = d.month >= 9 ? d.year : d.year - 1;
  return { year: `${startYear}-${startYear + 1}`, semester: inFirstSemester ? 1 : 2 };
}

export async function seedCampus() {
  const plan = await readCampusPlan(await readFile(fileURLToPath(WORKBOOK)));

  const faculty = await prisma.faculty.create({
    data: {
      name: 'Facultatea de Automatică și Calculatoare',
      shortName: 'AC',
      university: 'Universitatea Tehnică Gheorghe Asachi din Iași',
      timezone: TIMEZONE,
    },
  });

  const start = termStart();
  const end = start.plus({ weeks: 14 }).minus({ days: 3 });
  const { year, semester } = academicYearOf(start);

  const term = await prisma.academicTerm.create({
    data: {
      facultyId: faculty.id,
      academicYear: year,
      semester,
      startsOn: dateOnly(start),
      endsOn: dateOnly(end),
      // the only value that cannot be derived from anything else ask do not guess
      firstWeekParity: 'impar',
      isCurrent: true,
      breaks: {
        create: [
          {
            kind: 'vacanta',
            label: semester === 1 ? 'Vacanța de iarnă' : 'Vacanța de primăvară',
            startsOn: dateOnly(start.plus({ weeks: 8 })),
            endsOn: dateOnly(start.plus({ weeks: 9 }).minus({ days: 3 })),
          },
          {
            kind: 'zi_libera',
            label: 'Zi liberă',
            startsOn: dateOnly(start.plus({ weeks: 5, days: 2 })),
            endsOn: dateOnly(start.plus({ weeks: 5, days: 2 })),
          },
        ],
      },
    },
  });

  const groups = await seedGroups(faculty.id, plan);
  const subjects = await seedSubjects(faculty.id, plan);
  const rooms = await seedBuildings(faculty.id, plan);

  return { faculty, term, groups, subjects, rooms };
}

async function seedGroups(facultyId: number, plan: CampusPlan) {
  await prisma.studyGroup.createMany({
    data: plan.groups.map((g) => ({
      facultyId,
      name: g.name,
      nameNorm: norm(g.name),
      studyYear: g.studyYear,
      subgroups: g.subgroups,
    })),
  });
  return prisma.studyGroup.findMany({ where: { facultyId }, orderBy: { id: 'asc' } });
}

async function seedSubjects(facultyId: number, plan: CampusPlan) {
  for (const subject of plan.subjects) {
    await prisma.subject.create({
      data: {
        facultyId,
        name: subject.name,
        nameNorm: norm(subject.name),
        shortName: subject.shortName,
        studyYear: subject.studyYear,
        aliases: {
          // an alias equal to the name would only duplicate the exact match
          create: subject.aliases
            .filter((a) => norm(a) !== norm(subject.name))
            .map((a) => ({ aliasNorm: norm(a) })),
        },
      },
    });
  }
  return prisma.subject.findMany({ where: { facultyId }, orderBy: { id: 'asc' } });
}

async function seedBuildings(facultyId: number, plan: CampusPlan) {
  let roomCount = 0;
  const buildings = [];

  for (const spec of plan.buildings) {
    const levels = [...new Set(spec.rooms.map((r) => r.level))].sort((a, b) => a - b);

    const building = await prisma.building.create({
      data: {
        facultyId,
        name: spec.name,
        code: spec.code,
        address: spec.address,
        latitude: spec.latitude,
        longitude: spec.longitude,
        entranceLat: spec.entranceLat,
        entranceLng: spec.entranceLng,
        floors: { create: levels.map((level) => ({ level, label: floorLabel(level) })) },
      },
      include: { floors: true },
    });
    buildings.push(building);

    for (const room of spec.rooms) {
      const floor = building.floors.find((f) => f.level === room.level);
      if (!floor) throw new Error(`missing floor ${room.level} in ${spec.name}`);
      await prisma.room.create({
        data: {
          floorId: floor.id,
          roomNumber: room.number,
          roomNumberNorm: normCompact(room.number),
          roomType: room.roomType,
          directions: room.directions,
          aliases: {
            create: room.aliases.map((alias) => ({ alias, aliasNorm: norm(alias) })),
          },
        },
      });
      roomCount++;
    }
  }

  return { buildings, roomCount };
}
