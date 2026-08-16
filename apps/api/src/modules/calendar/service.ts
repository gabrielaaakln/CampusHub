import { DateTime } from 'luxon';
import type { CalendarDto, CalendarItem } from '@campushub/shared';
import { prisma } from '../../lib/db.js';
import { hhmm } from '../schedule/resolve.js';
import {
  expandOccurrences,
  weeksInRange,
  type Break,
  type SlotRule,
  type TermDates,
} from '../schedule/occurrences.js';

export type CalendarInput = {
  facultyId: number;
  groupId: number | null;
  subgroup: number | null;
  from: string;
  to: string;
};

type ClassRule = SlotRule & {
  subjectName: string;
  subjectId: number | null;
  professor: string | null;
  classType: CalendarItem['type'];
  groupName: string;
  room: { id: number; number: string; building: string } | null;
};

export async function calendarFor(input: CalendarInput): Promise<CalendarDto> {
  const term = await prisma.academicTerm.findFirst({
    where: { facultyId: input.facultyId, isCurrent: true },
    include: { breaks: { select: { startsOn: true, endsOn: true } } },
  });

  const faculty = await prisma.faculty.findUnique({
    where: { id: input.facultyId },
    select: { timezone: true },
  });
  const zone = faculty?.timezone ?? 'Europe/Bucharest';

  const items: CalendarItem[] = [];
  let weeks: CalendarDto['weeks'] = [];

  if (term && input.groupId !== null) {
    const dates: TermDates = {
      startsOn: term.startsOn,
      endsOn: term.endsOn,
      firstWeekParity: term.firstWeekParity,
      timezone: zone,
    };
    const breaks: Break[] = term.breaks;
    weeks = weeksInRange(dates, input.from, input.to);

    const rules = await classRules(term.id, input.groupId, input.subgroup);
    for (const held of expandOccurrences({ term: dates, breaks, rules, from: input.from, to: input.to })) {
      items.push({
        id: `sched:${held.rule.id}:${held.date}`,
        kind: 'class',
        title: held.rule.subjectName,
        type: held.rule.classType,
        subjectId: held.rule.subjectId,
        startsAt: held.startsAt.toISO() ?? '',
        endsAt: held.endsAt.toISO() ?? '',
        professor: held.rule.professor,
        group: held.rule.groupName,
        room: held.rule.room,
      });
    }
  }

  items.push(...(await deadlines(input, zone)), ...(await events(input, zone)));
  items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return {
    term: term
      ? {
          id: term.id,
          academicYear: term.academicYear,
          semester: term.semester,
          timezone: zone,
        }
      : null,
    weeks,
    items,
  };
}

async function classRules(
  termId: number,
  groupId: number,
  subgroup: number | null,
): Promise<ClassRule[]> {
  const rows = await prisma.scheduleEntry.findMany({
    where: {
      termId,
      groupId,
      isActive: true,
      // subgroup 0 is the whole group so it always belongs to the student
      ...(subgroup ? { subgroup: { in: [0, subgroup] } } : {}),
    },
    include: {
      subject: { select: { id: true, name: true } },
      group: { select: { name: true } },
      room: {
        select: {
          id: true,
          roomNumber: true,
          floor: { select: { building: { select: { name: true } } } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    dayOfWeek: row.dayOfWeek,
    startTime: hhmm(row.startTime),
    endTime: hhmm(row.endTime),
    parity: row.parity,
    startsWeek: row.startsWeek,
    endsWeek: row.endsWeek,
    subjectName: row.subject?.name ?? row.subjectRaw,
    subjectId: row.subject?.id ?? null,
    professor: row.professor,
    classType: row.classType,
    groupName: row.group.name,
    room: row.room
      ? {
          id: row.room.id,
          number: row.room.roomNumber,
          building: row.room.floor.building.name,
        }
      : null,
  }));
}

// every item leaves with the faculty offset so the list reads as one source
const iso = (value: Date, zone: string): string =>
  DateTime.fromJSDate(value).setZone(zone).toISO() ?? value.toISOString();

function boundsOf(input: CalendarInput, zone: string): { from: Date; to: Date } {
  return {
    from: DateTime.fromISO(input.from, { zone }).startOf('day').toJSDate(),
    to: DateTime.fromISO(input.to, { zone }).endOf('day').toJSDate(),
  };
}

async function deadlines(input: CalendarInput, zone: string): Promise<CalendarItem[]> {
  const { from, to } = boundsOf(input, zone);
  const rows = await prisma.deadline.findMany({
    where: {
      facultyId: input.facultyId,
      isDeleted: false,
      dueAt: { gte: from, lte: to },
      // a deadline without a group belongs to the whole faculty
      OR: [{ groupId: null }, ...(input.groupId ? [{ groupId: input.groupId }] : [])],
    },
    orderBy: { dueAt: 'asc' },
  });

  return rows.map((row) => ({
    id: `deadline:${row.id}`,
    kind: 'deadline' as const,
    title: row.title,
    type: row.type,
    subjectId: row.subjectId,
    startsAt: iso(row.dueAt, zone),
    endsAt: null,
  }));
}

async function events(input: CalendarInput, zone: string): Promise<CalendarItem[]> {
  const { from, to } = boundsOf(input, zone);
  const rows = await prisma.event.findMany({
    where: { facultyId: input.facultyId, isDeleted: false, startsAt: { gte: from, lte: to } },
    orderBy: { startsAt: 'asc' },
    include: {
      room: {
        select: {
          id: true,
          roomNumber: true,
          floor: { select: { building: { select: { name: true } } } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: `event:${row.id}`,
    kind: 'event' as const,
    title: row.title,
    startsAt: iso(row.startsAt, zone),
    endsAt: row.endsAt ? iso(row.endsAt, zone) : null,
    location: row.location,
    link: row.externalUrl,
    room: row.room
      ? { id: row.room.id, number: row.room.roomNumber, building: row.room.floor.building.name }
      : null,
  }));
}
