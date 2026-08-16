import { z } from 'zod';
import { isoDate } from './common.js';
import type { ClassType, DeadlineType, WeekParity } from './enums.js';

export const MAX_CALENDAR_DAYS = 62;

export const calendarQuery = z
  .object({
    from: isoDate,
    to: isoDate,
    groupId: z.coerce.number().int().positive().optional(),
    subgroup: z.coerce.number().int().min(1).max(4).optional(),
  })
  .refine((q) => q.to >= q.from, {
    message: 'Intervalul se termină înainte să înceapă',
    path: ['to'],
  })
  .refine((q) => daysBetween(q.from, q.to) <= MAX_CALENDAR_DAYS, {
    message: `Cere cel mult ${MAX_CALENDAR_DAYS} de zile odată`,
    path: ['to'],
  });
export type CalendarQuery = z.infer<typeof calendarQuery>;

function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000;
}

/** the export covers a whole window not one week so it has its own looser bounds */
export const ICS_DAYS_BEFORE = 7;
export const ICS_DAYS_AFTER = 120;

export const calendarIcsQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type CalendarIcsQuery = z.infer<typeof calendarIcsQuery>;

export type CalendarKind = 'class' | 'deadline' | 'event';

export type CalendarItem = {
  /** stable across calls sched entry id plus the date it falls on */
  id: string;
  kind: CalendarKind;
  title: string;
  startsAt: string;
  endsAt: string | null;
  type?: ClassType | DeadlineType;
  subjectId?: number | null;
  room?: { id: number | null; number: string | null; building: string | null } | null;
  professor?: string | null;
  group?: string | null;
  location?: string | null;
  link?: string | null;
};

export type CalendarWeekInfo = {
  /** 1 based index of the week inside the term */
  index: number;
  parity: Exclude<WeekParity, 'ambele'>;
  startsOn: string;
  endsOn: string;
};

export type CalendarDto = {
  term: { id: number; academicYear: string; semester: number; timezone: string } | null;
  weeks: CalendarWeekInfo[];
  items: CalendarItem[];
};
