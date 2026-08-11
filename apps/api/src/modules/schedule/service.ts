import type { Prisma } from '@prisma/client';
import type { ScheduleDayDto, ScheduleEntryDto } from '@campushub/shared';
import { dayOfWeek } from '@campushub/shared';
import { prisma } from '../../lib/db.js';
import { notFound } from '../../lib/errors.js';
import { hhmm } from './resolve.js';
import type { TermRef } from './types.js';

const entryInclude = {
  subject: { select: { id: true, name: true, shortName: true } },
  room: {
    select: {
      id: true,
      roomNumber: true,
      directions: true,
      floor: { select: { label: true, level: true, building: { select: { name: true } } } },
    },
  },
} satisfies Prisma.ScheduleEntryInclude;

type EntryRow = Prisma.ScheduleEntryGetPayload<{ include: typeof entryInclude }>;

export async function currentTerm(facultyId: number): Promise<TermRef> {
  const term = await prisma.academicTerm.findFirst({
    where: { facultyId, isCurrent: true },
    select: { id: true, facultyId: true, academicYear: true, semester: true },
  });
  if (!term) throw notFound('Nu există un semestru curent configurat');
  return term;
}

export async function termById(id: number): Promise<TermRef> {
  const term = await prisma.academicTerm.findUnique({
    where: { id },
    select: { id: true, facultyId: true, academicYear: true, semester: true },
  });
  if (!term) throw notFound('Semestrul nu există');
  return term;
}

export async function weekForGroup(
  termId: number,
  groupId: number,
  subgroup: number | null,
): Promise<ScheduleDayDto[]> {
  const entries = await prisma.scheduleEntry.findMany({
    where: {
      termId,
      groupId,
      isActive: true,
      // subgroup 0 is the whole group so it always shows next to the subgroup rows
      ...(subgroup ? { subgroup: { in: [0, subgroup] } } : {}),
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }, { subgroup: 'asc' }],
    include: entryInclude,
  });

  const days: ScheduleDayDto[] = dayOfWeek.options.map((day) => ({ day, entries: [] }));
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const entry of entries) byDay.get(entry.dayOfWeek)?.entries.push(toDto(entry));

  return days.filter((d) => d.entries.length > 0);
}

export async function lastRun(facultyId: number) {
  const run = await prisma.scrapeRun.findFirst({
    where: { facultyId },
    orderBy: { startedAt: 'desc' },
  });
  if (!run) return null;
  return {
    id: run.id,
    adapter: run.adapter,
    source: run.source,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    found: run.entriesFound,
    added: run.entriesAdded,
    changed: run.entriesChanged,
    removed: run.entriesRemoved,
    errorMessage: run.errorMessage,
  };
}

export function recentChanges(groupId: number, limit: number) {
  return prisma.scheduleChange.findMany({
    where: { groupId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, kind: true, before: true, after: true, createdAt: true },
  });
}

function toDto(entry: EntryRow): ScheduleEntryDto {
  return {
    id: entry.id,
    subgroup: entry.subgroup,
    startTime: hhmm(entry.startTime),
    endTime: hhmm(entry.endTime),
    classType: entry.classType,
    parity: entry.parity,
    startsWeek: entry.startsWeek,
    endsWeek: entry.endsWeek,
    subject: entry.subject,
    subjectRaw: entry.subjectRaw,
    professor: entry.professor,
    room: entry.room
      ? {
          id: entry.room.id,
          number: entry.room.roomNumber,
          building: entry.room.floor.building.name,
          floor: entry.room.floor.label ?? `Etaj ${entry.room.floor.level}`,
          directions: entry.room.directions,
        }
      : null,
    roomRaw: entry.roomRaw,
  };
}
