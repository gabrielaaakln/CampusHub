import { z } from 'zod';
import { classType, dayOfWeek, weekParity } from './enums.js';
import type {
  ClassType,
  DayOfWeek,
  ScheduleChangeKind,
  ScheduleSource,
  ScrapeStatus,
  WeekParity,
} from './enums.js';

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Ora trebuie să fie de forma HH:MM');

/** weeks are counted from the first week of the term */
export const MAX_TERM_WEEKS = 30;

const weekNumber = z.coerce.number().int().min(1).max(MAX_TERM_WEEKS).optional();

/** what every adapter must produce everything after this is common code */
export const rawEntry = z
  .object({
    groupName: z.string().trim().min(1).max(50),
    subgroup: z.coerce.number().int().min(0).max(4),
    day: dayOfWeek,
    startTime: hhmm,
    endTime: hhmm,
    classType: classType,
    parity: weekParity,
    // set only when the activity covers part of the semester
    startsWeek: weekNumber,
    endsWeek: weekNumber,
    subject: z.string().trim().min(1).max(200),
    room: z.string().trim().max(50).optional(),
    professor: z.string().trim().max(150).optional(),
  })
  .refine((e) => e.endTime > e.startTime, {
    message: 'Ora de sfârșit trebuie să fie după cea de început',
    path: ['endTime'],
  })
  .refine((e) => e.startsWeek === undefined || e.endsWeek === undefined || e.endsWeek >= e.startsWeek, {
    message: 'Săptămâna de sfârșit trebuie să fie după cea de început',
    path: ['endsWeek'],
  });

export type RawEntry = z.infer<typeof rawEntry>;

/** subgroup 0 means the whole group 1 to 4 are the subgroups */
export const WHOLE_GROUP = 0;

export type ScheduleSlotKey = {
  groupId: number;
  subgroup: number;
  day: string;
  startTime: string;
  classType: string;
  parity: string;
};

export const slotKey = (k: ScheduleSlotKey): string =>
  [k.groupId, k.subgroup, k.day, k.startTime, k.classType, k.parity].join('|');

export type ScheduleRoomDto = {
  id: number;
  number: string;
  building: string;
  floor: string;
  directions: string | null;
};

export type ScheduleEntryDto = {
  id: number;
  subgroup: number;
  startTime: string;
  endTime: string;
  classType: ClassType;
  parity: WeekParity;
  startsWeek: number | null;
  endsWeek: number | null;
  subject: { id: number; name: string; shortName: string | null } | null;
  subjectRaw: string;
  professor: string | null;
  room: ScheduleRoomDto | null;
  roomRaw: string | null;
};

export type ScheduleDayDto = { day: DayOfWeek; entries: ScheduleEntryDto[] };

export type ScheduleWeekDto = {
  term: { id: number; academicYear: string; semester: number };
  group: { id: number; name: string; studyYear: number };
  subgroup: number | null;
  days: ScheduleDayDto[];
};

export type ScheduleRunDto = {
  id: number;
  adapter: string | null;
  source: ScheduleSource;
  status: ScrapeStatus | null;
  startedAt: string;
  finishedAt: string | null;
  found: number;
  added: number;
  changed: number;
  removed: number;
  errorMessage: string | null;
};

/** what POST /schedule/import answers the importer builds exactly this */
export type ScheduleImportDto = {
  runId: number;
  status: 'success' | 'partial' | 'failed';
  found: number;
  added: number;
  changed: number;
  removed: number;
  unresolvedSubjects: string[];
  errors: string[];
};

export type ScheduleChangeDto = {
  id: number;
  kind: ScheduleChangeKind;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
};
