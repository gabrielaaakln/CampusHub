import type { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import type { EventDto, EventListQuery, Paginated } from '@campushub/shared';
import { prisma } from '../../lib/db.js';
import { authorSelect, toAuthor } from '../../lib/author.js';
import { notFound } from '../../lib/errors.js';

const eventInclude = {
  author: { select: authorSelect },
  room: {
    select: {
      id: true,
      roomNumber: true,
      floor: { select: { building: { select: { name: true } } } },
    },
  },
  _count: { select: { attendees: true } },
} satisfies Prisma.EventInclude;

type EventRow = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

async function facultyZone(facultyId: number): Promise<string> {
  const faculty = await prisma.faculty.findUnique({
    where: { id: facultyId },
    select: { timezone: true },
  });
  return faculty?.timezone ?? 'Europe/Bucharest';
}

export async function listEvents(
  facultyId: number,
  query: EventListQuery,
  viewerId: number | null,
): Promise<Paginated<EventDto>> {
  const zone = await facultyZone(facultyId);
  // no from means from now on nobody opens this screen for last year
  const from = query.from
    ? DateTime.fromISO(query.from, { zone }).startOf('day').toJSDate()
    : new Date();
  const to = query.to ? DateTime.fromISO(query.to, { zone }).endOf('day').toJSDate() : null;

  const where: Prisma.EventWhereInput = {
    facultyId,
    isDeleted: false,
    startsAt: { gte: from, ...(to ? { lte: to } : {}) },
    ...(query.mine === 'true' && viewerId ? { attendees: { some: { userId: viewerId } } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: eventInclude,
    }),
    prisma.event.count({ where }),
  ]);

  const attending = await myAttendance(
    viewerId,
    rows.map((r) => r.id),
  );

  return {
    data: rows.map((row) => toEventDto(row, zone, attending.has(row.id))),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      has_next: query.page * query.limit < total,
    },
  };
}

export async function eventById(
  facultyId: number,
  id: number,
  viewerId: number | null,
): Promise<EventDto> {
  const row = await prisma.event.findFirst({
    where: { id, facultyId, isDeleted: false },
    include: eventInclude,
  });
  if (!row) throw notFound('Evenimentul nu există');

  const zone = await facultyZone(facultyId);
  const attending = await myAttendance(viewerId, [row.id]);
  return toEventDto(row, zone, attending.has(row.id));
}

async function myAttendance(viewerId: number | null, eventIds: number[]): Promise<Set<number>> {
  if (!viewerId || eventIds.length === 0) return new Set();
  const rows = await prisma.eventAttendee.findMany({
    where: { userId: viewerId, eventId: { in: eventIds } },
    select: { eventId: true },
  });
  return new Set(rows.map((row) => row.eventId));
}

/** signing up twice is the same as signing up once */
export async function attend(eventId: number, userId: number): Promise<void> {
  await prisma.eventAttendee.upsert({
    where: { eventId_userId: { eventId, userId } },
    create: { eventId, userId },
    update: {},
  });
}

export async function withdraw(eventId: number, userId: number): Promise<void> {
  await prisma.eventAttendee.deleteMany({ where: { eventId, userId } });
}

function toEventDto(row: EventRow, zone: string, isAttending: boolean): EventDto {
  const iso = (value: Date) => DateTime.fromJSDate(value).setZone(zone).toISO() ?? value.toISOString();
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    room: row.room
      ? { id: row.room.id, number: row.room.roomNumber, building: row.room.floor.building.name }
      : null,
    startsAt: iso(row.startsAt),
    endsAt: row.endsAt ? iso(row.endsAt) : null,
    externalUrl: row.externalUrl,
    author: toAuthor(row.author),
    attendeeCount: row._count.attendees,
    isAttending,
    createdAt: row.createdAt.toISOString(),
  };
}
