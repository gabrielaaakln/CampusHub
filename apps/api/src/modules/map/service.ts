import type { Prisma } from '@prisma/client';
import { norm, normCompact, type BuildingDto, type FloorDto, type RoomDto } from '@campushub/shared';
import { prisma } from '../../lib/db.js';
import { isFeatureOn } from '../../config.js';
import { notFound } from '../../lib/errors.js';
import { hhmm } from '../schedule/resolve.js';

const roomInclude = {
  aliases: { select: { alias: true } },
  floor: {
    select: {
      id: true,
      level: true,
      label: true,
      building: {
        select: {
          id: true,
          name: true,
          code: true,
          address: true,
          latitude: true,
          longitude: true,
          entranceLat: true,
          entranceLng: true,
        },
      },
    },
  },
} satisfies Prisma.RoomInclude;

type RoomRow = Prisma.RoomGetPayload<{ include: typeof roomInclude }>;

// prisma reads decimal columns as its own type and json would carry an object
const num = (value: Prisma.Decimal | null): number | null => (value === null ? null : Number(value));

export async function listBuildings(facultyId: number): Promise<BuildingDto[]> {
  const buildings = await prisma.building.findMany({
    where: { facultyId },
    orderBy: { name: 'asc' },
    include: { floors: { select: { _count: { select: { rooms: true } } } } },
  });

  return buildings.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    address: b.address,
    latitude: num(b.latitude),
    longitude: num(b.longitude),
    entranceLat: num(b.entranceLat),
    entranceLng: num(b.entranceLng),
    floorCount: b.floors.length,
    roomCount: b.floors.reduce((sum, f) => sum + f._count.rooms, 0),
  }));
}

export async function listFloors(facultyId: number, buildingId: number): Promise<FloorDto[]> {
  const building = await prisma.building.findFirst({
    where: { id: buildingId, facultyId },
    include: {
      floors: {
        orderBy: { level: 'asc' },
        include: { _count: { select: { rooms: true } } },
      },
    },
  });
  if (!building) throw notFound('Clădirea nu există');

  return building.floors.map((f) => ({
    id: f.id,
    level: f.level,
    label: f.label ?? defaultFloorLabel(f.level),
    roomCount: f._count.rooms,
    ...(isFeatureOn('floorplans') ? { svgUrl: f.svgUrl } : {}),
  }));
}

export async function listRooms(facultyId: number, floorId: number): Promise<RoomDto[]> {
  const floor = await prisma.floor.findFirst({
    where: { id: floorId, building: { facultyId } },
    select: { id: true },
  });
  if (!floor) throw notFound('Etajul nu există');

  const rooms = await prisma.room.findMany({
    where: { floorId },
    orderBy: { roomNumber: 'asc' },
    include: roomInclude,
  });
  return rooms.map(toRoomDto);
}

export async function roomById(facultyId: number, id: number): Promise<RoomDto> {
  const room = await prisma.room.findFirst({
    where: { id, floor: { building: { facultyId } } },
    include: roomInclude,
  });
  if (!room) throw notFound('Sala nu există');
  return toRoomDto(room);
}

/** what happens in the room this week so the page answers is it free now */
export async function roomClasses(roomId: number, termId: number) {
  const entries = await prisma.scheduleEntry.findMany({
    where: { roomId, termId, isActive: true },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      classType: true,
      subjectRaw: true,
      subject: { select: { name: true } },
      group: { select: { name: true } },
    },
  });

  return entries.map((e) => ({
    id: e.id,
    day: e.dayOfWeek,
    startTime: hhmm(e.startTime),
    endTime: hhmm(e.endTime),
    classType: e.classType,
    subject: e.subject?.name ?? e.subjectRaw,
    group: e.group.name,
  }));
}

const TRIGRAM_THRESHOLD = 0.2;

/**
 * fuzzy over the room number and the aliases so lab retele finds the room
 * a short query never reaches the trigram threshold which is why the prefix is checked too
 */
export async function searchRooms(
  facultyId: number,
  query: string,
  limit: number,
): Promise<RoomDto[]> {
  const spaced = norm(query);
  const compact = normCompact(query);
  if (!compact) return [];

  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT r.id,
           GREATEST(
             similarity(r.room_number_norm, ${compact}),
             COALESCE(MAX(similarity(a.alias_norm, ${spaced})), 0),
             CASE WHEN r.room_number_norm LIKE ${compact + '%'} THEN 1 ELSE 0 END
           ) AS score
      FROM rooms r
      JOIN floors f    ON f.id = r.floor_id
      JOIN buildings b ON b.id = f.building_id
      LEFT JOIN room_aliases a ON a.room_id = r.id
     WHERE b.faculty_id = ${facultyId}
       AND (   r.room_number_norm LIKE ${compact + '%'}
            OR similarity(r.room_number_norm, ${compact}) > ${TRIGRAM_THRESHOLD}
            OR similarity(a.alias_norm, ${spaced}) > ${TRIGRAM_THRESHOLD})
     GROUP BY r.id
     ORDER BY score DESC, r.room_number ASC
     LIMIT ${limit}`;

  if (rows.length === 0) return [];

  const rooms = await prisma.room.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    include: roomInclude,
  });
  // the database ordered by score and findMany does not keep that order
  const byId = new Map(rooms.map((r) => [r.id, r]));
  return rows.flatMap((r) => {
    const room = byId.get(r.id);
    return room ? [toRoomDto(room)] : [];
  });
}

function defaultFloorLabel(level: number): string {
  return level === 0 ? 'Parter' : `Etaj ${level}`;
}

function toRoomDto(room: RoomRow): RoomDto {
  const building = room.floor.building;
  return {
    id: room.id,
    number: room.roomNumber,
    roomType: room.roomType,
    capacity: room.capacity,
    directions: room.directions,
    notes: room.notes,
    aliases: room.aliases.map((a) => a.alias),
    floor: {
      id: room.floor.id,
      level: room.floor.level,
      label: room.floor.label ?? defaultFloorLabel(room.floor.level),
    },
    building: {
      id: building.id,
      name: building.name,
      code: building.code,
      address: building.address,
      latitude: num(building.latitude),
      longitude: num(building.longitude),
      entranceLat: num(building.entranceLat),
      entranceLng: num(building.entranceLng),
    },
    ...(isFeatureOn('floorplans') ? { svgElementId: room.svgElementId } : {}),
  };
}
