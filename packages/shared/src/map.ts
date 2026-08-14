import { z } from 'zod';
import type { RoomType } from './enums.js';

export const roomSearchQuery = z.object({
  q: z.string().trim().min(1, 'Scrie ce sală cauți').max(80),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type RoomSearchQuery = z.infer<typeof roomSearchQuery>;

export type BuildingDto = {
  id: number;
  name: string;
  code: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  entranceLat: number | null;
  entranceLng: number | null;
  floorCount: number;
  roomCount: number;
};

export type FloorDto = {
  id: number;
  level: number;
  label: string;
  roomCount: number;
  /** only sent when the floorplans feature is on */
  svgUrl?: string | null;
};

export type RoomBuildingDto = {
  id: number;
  name: string;
  code: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  entranceLat: number | null;
  entranceLng: number | null;
};

export type RoomDto = {
  id: number;
  number: string;
  roomType: RoomType;
  capacity: number | null;
  directions: string | null;
  notes: string | null;
  aliases: string[];
  floor: { id: number; level: number; label: string };
  building: RoomBuildingDto;
  /** only sent when the floorplans feature is on */
  svgElementId?: string | null;
};

/** what a class in this room looks like on the room page */
export type RoomClassDto = {
  id: number;
  day: string;
  startTime: string;
  endTime: string;
  classType: string;
  subject: string;
  group: string;
};
