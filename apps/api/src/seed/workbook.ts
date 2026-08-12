import type { RawEntry } from '@campushub/shared';
import { norm } from '@campushub/shared';
import {
  dictionariesOf,
  extractEntries,
  loadWorkbook,
} from '../modules/schedule/adapters/xlsx.js';

export type RoomPlan = {
  number: string;
  roomType: 'curs' | 'seminar' | 'laborator' | 'birou' | 'altele';
  level: number;
  floorLabel: string;
  directions: string | null;
  aliases: string[];
};

export type BuildingPlan = {
  name: string;
  code: string;
  address: string;
  latitude: number;
  longitude: number;
  entranceLat: number | null;
  entranceLng: number | null;
  rooms: RoomPlan[];
};

export type GroupPlan = { name: string; studyYear: number; subgroups: number };

export type SubjectPlan = {
  name: string;
  shortName: string | null;
  studyYear: number | null;
  aliases: string[];
};

export type CampusPlan = {
  buildings: BuildingPlan[];
  groups: GroupPlan[];
  subjects: SubjectPlan[];
  entries: RawEntry[];
};

type BuildingRule = {
  name: string;
  code: string;
  address: string;
  latitude: number;
  longitude: number;
  /** null where no facade is known the map then falls back to the pin */
  entranceLat: number | null;
  entranceLng: number | null;
  matches: RegExp;
  /** used when the workbook location text does not name a floor */
  level?: (id: string) => number | null;
};

const mangeron = (number: string) => `Bd. Prof. dr. doc. Dimitrie Mangeron ${number}, Iași`;

// coordinates come from the openstreetmap footprints of the buildings themselves
// the pin sits inside the polygon not on its centroid an L shaped block has its centre in the yard
// the entrance is the facade vertex nearest the boulevard null where no facade is known
// AC A and C are three wings of one complex at Mangeron 27 the wings are the only guess left
// order matters AC has to be tried before A and C
const BUILDINGS: BuildingRule[] = [
  {
    name: 'Corp AC',
    code: 'AC',
    address: mangeron('27'),
    latitude: 47.15402,
    longitude: 27.59338,
    entranceLat: 47.1535,
    entranceLng: 27.59402,
    matches: /^AC(\d)/,
    level: (id) => digitAfter(id, /^AC(\d)/),
  },
  {
    name: 'Corp A (DAIA)',
    code: 'A',
    address: mangeron('27'),
    latitude: 47.15411,
    longitude: 27.59352,
    entranceLat: null,
    entranceLng: null,
    matches: /^A(\d)-/,
    level: (id) => digitAfter(id, /^A(\d)-/),
  },
  {
    name: 'Corp C',
    code: 'C',
    address: mangeron('27'),
    latitude: 47.15369,
    longitude: 27.59407,
    entranceLat: null,
    entranceLng: null,
    matches: /^C(\d)-/,
    level: (id) => digitAfter(id, /^C(\d)-/),
  },
  {
    name: 'Corp Instalații',
    code: 'CI',
    address: mangeron('45A'),
    latitude: 47.15369,
    longitude: 27.59178,
    entranceLat: 47.1533,
    entranceLng: 27.59194,
    matches: /^CI-/,
    level: () => 0,
  },
  {
    name: 'Facultatea de Chimie',
    code: 'CH',
    address: mangeron('73'),
    latitude: 47.15525,
    longitude: 27.6031,
    entranceLat: 47.15498,
    entranceLng: 27.60284,
    matches: /^CH/,
    level: (id) => digitAfter(id, /Et(\d+)/i),
  },
  {
    name: 'Facultatea de Electrotehnică',
    code: 'E',
    address: mangeron('21-23'),
    latitude: 47.15312,
    longitude: 27.59369,
    entranceLat: 47.15294,
    entranceLng: 27.59338,
    matches: /^E\d/,
    // E407 is on the fourth floor E1 has no floor digit at all
    level: (id) => digitAfter(id, /^E(\d)\d{2}$/) ?? 0,
  },
  {
    name: 'Corp T (Rectorat)',
    code: 'T',
    address: mangeron('67'),
    latitude: 47.15457,
    longitude: 27.59954,
    entranceLat: 47.15456,
    entranceLng: 27.60036,
    matches: /^T[\d-]|R$/,
    level: (id) => digitAfter(id, /^(\d)\./),
  },
  {
    name: 'Corp Textile (Ștefănescu)',
    code: 'TEX',
    address: mangeron('29'),
    latitude: 47.1534,
    longitude: 27.59537,
    entranceLat: 47.1534,
    entranceLng: 27.59612,
    matches: /^Stef/i,
  },
  {
    name: 'Săli de sport',
    code: 'SP',
    address: 'Complexul Studențesc Tudor Vladimirescu, Iași',
    latitude: 47.15466,
    longitude: 27.6111,
    entranceLat: null,
    entranceLng: null,
    matches: /^Sport/i,
  },
  {
    name: 'Corp Copou (ETTI)',
    code: 'CP',
    address: 'Bd. Carol I 11, Iași',
    latitude: 47.1748,
    longitude: 27.57115,
    entranceLat: null,
    entranceLng: null,
    matches: /^(S2\.C|I\.|III[.-])/,
  },
];

function digitAfter(id: string, pattern: RegExp): number | null {
  const found = pattern.exec(id);
  return found?.[1] === undefined ? null : Number(found[1]);
}

function levelFromText(text: string): number | null {
  if (/parter/i.test(text)) return 0;
  const etaj = /etaj\w*\s*(\d+)/i.exec(text);
  return etaj?.[1] === undefined ? null : Number(etaj[1]);
}

export function floorLabel(level: number): string {
  return level === 0 ? 'Parter' : `Etaj ${level}`;
}

/** the location text already names the building for rooms outside the faculty */
function directionsFor(text: string, buildingName: string): string | null {
  if (!text) return null;
  const building = norm(buildingName);
  const mentioned = norm(text)
    .split(' ')
    .some((word) => word.length > 3 && building.includes(word));
  return mentioned ? text : `${buildingName}, ${text}`;
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };

/** the second digit is the year 1306 is third year SCI-I-1 is a first year master group */
function studyYearOf(name: string): number {
  const licence = /^\d(\d)\d{2}$/.exec(name);
  if (licence?.[1]) return Number(licence[1]);
  const master = /-([IV]+)-/.exec(name);
  return (master?.[1] ? ROMAN[master[1]] : undefined) ?? 1;
}

export async function readCampusPlan(buffer: Buffer): Promise<CampusPlan> {
  const wb = await loadWorkbook(buffer);
  const dicts = dictionariesOf(wb);
  const { entries } = extractEntries(wb, dicts);

  return {
    buildings: buildRooms(dicts.rooms, entries),
    groups: buildGroups(entries),
    subjects: buildSubjects(entries, dicts.subjects),
    entries,
  };
}

type RoomUsage = { types: Map<string, number>; labSubjects: Map<string, number> };

function usageByRoom(entries: RawEntry[]): Map<string, RoomUsage> {
  const usage = new Map<string, RoomUsage>();
  for (const entry of entries) {
    if (!entry.room) continue;
    const room = usage.get(entry.room) ?? { types: new Map(), labSubjects: new Map() };
    room.types.set(entry.classType, (room.types.get(entry.classType) ?? 0) + 1);
    if (entry.classType === 'laborator') {
      room.labSubjects.set(entry.subject, (room.labSubjects.get(entry.subject) ?? 0) + 1);
    }
    usage.set(entry.room, room);
  }
  return usage;
}

const ROOM_TYPE: Record<string, RoomPlan['roomType']> = {
  curs: 'curs',
  seminar: 'seminar',
  laborator: 'laborator',
  proiect: 'laborator',
};

function topKeys(counts: Map<string, number>, limit: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function buildRooms(rooms: Map<string, string>, entries: RawEntry[]): BuildingPlan[] {
  const usage = usageByRoom(entries);
  const plans = new Map<string, BuildingPlan>();

  for (const [id, text] of rooms) {
    const rule = BUILDINGS.find((b) => b.matches.test(id));
    if (!rule) continue;

    const plan = plans.get(rule.code) ?? { ...buildingOf(rule), rooms: [] };
    plans.set(rule.code, plan);

    const level = levelFromText(text) ?? rule.level?.(id) ?? 0;
    const room = usage.get(id);
    const dominant = room ? topKeys(room.types, 1)[0] : undefined;

    plan.rooms.push({
      number: id,
      roomType: (dominant ? ROOM_TYPE[dominant] : undefined) ?? 'altele',
      level,
      floorLabel: floorLabel(level),
      directions: directionsFor(text, rule.name),
      // a room that hosts one lab all semester is what students call it by
      aliases: room ? topKeys(room.labSubjects, 3).map((subject) => `lab ${subject}`) : [],
    });
  }

  return [...plans.values()].filter((b) => b.rooms.length > 0);
}

function buildingOf(rule: BuildingRule): Omit<BuildingPlan, 'rooms'> {
  return {
    name: rule.name,
    code: rule.code,
    address: rule.address,
    latitude: rule.latitude,
    longitude: rule.longitude,
    entranceLat: rule.entranceLat,
    entranceLng: rule.entranceLng,
  };
}

function buildGroups(entries: RawEntry[]): GroupPlan[] {
  const subgroups = new Map<string, number>();
  for (const entry of entries) {
    subgroups.set(entry.groupName, Math.max(subgroups.get(entry.groupName) ?? 1, entry.subgroup));
  }
  return [...subgroups.entries()]
    .map(([name, count]) => ({ name, studyYear: studyYearOf(name), subgroups: count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ro'));
}

function buildSubjects(entries: RawEntry[], codes: Map<string, string>): SubjectPlan[] {
  const byName = new Map<string, { years: Set<number>; aliases: Set<string> }>();

  for (const entry of entries) {
    const subject = byName.get(entry.subject) ?? { years: new Set(), aliases: new Set() };
    subject.years.add(studyYearOf(entry.groupName));
    byName.set(entry.subject, subject);
  }
  for (const [code, name] of codes) {
    byName.get(name)?.aliases.add(code);
  }

  return [...byName.entries()]
    .map(([name, { years, aliases }]) => ({
      name,
      shortName: [...aliases][0] ?? (name.length <= 50 ? name : null),
      studyYear: years.size > 0 ? Math.min(...years) : null,
      aliases: [...aliases],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ro'));
}
