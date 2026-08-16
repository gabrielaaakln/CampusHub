import { DateTime, Interval } from 'luxon';
import { DAY_BY_ISO_WEEKDAY, type DayOfWeek, type WeekParity } from '@campushub/shared';

export type TermDates = {
  startsOn: Date;
  endsOn: Date;
  firstWeekParity: WeekParity;
  timezone: string;
};

export type Break = { startsOn: Date; endsOn: Date };

/** a weekly rule ready to be placed on real dates */
export type SlotRule = {
  id: number;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  parity: WeekParity;
  startsWeek: number | null;
  endsWeek: number | null;
};

export type Occurrence<T extends SlotRule> = {
  rule: T;
  date: string;
  weekIndex: number;
  startsAt: DateTime;
  endsAt: DateTime;
};

const flip = (parity: WeekParity): WeekParity =>
  parity === 'impar' ? 'par' : parity === 'par' ? 'impar' : 'ambele';

function startOfWeek(date: DateTime): DateTime {
  return date.startOf('week');
}

/** a date column holds a calendar day so it is read in utc and moved to the faculty zone */
export function calendarDay(value: Date, zone: string): DateTime {
  return DateTime.fromJSDate(value, { zone: 'utc' })
    .setZone(zone, { keepLocalTime: true })
    .startOf('day');
}

/** 1 for the first week of the term and it keeps counting after it ends */
export function weekIndexOf(term: TermDates, date: DateTime): number {
  const start = startOfWeek(calendarDay(term.startsOn, term.timezone));
  const weeks = Interval.fromDateTimes(start, startOfWeek(date)).length('weeks');
  return Math.floor(weeks) + 1;
}

/** first_week_parity is entered by hand it is the one thing that cannot be derived */
export function parityOf(term: TermDates, date: DateTime): Exclude<WeekParity, 'ambele'> {
  const index = weekIndexOf(term, date);
  const base = term.firstWeekParity === 'ambele' ? 'impar' : term.firstWeekParity;
  return (index % 2 === 1 ? base : flip(base)) as Exclude<WeekParity, 'ambele'>;
}

function coveredByBreak(breaks: Break[], date: DateTime, zone: string): boolean {
  return breaks.some((b) => {
    const from = calendarDay(b.startsOn, zone);
    const to = calendarDay(b.endsOn, zone).endOf('day');
    return date >= from && date <= to;
  });
}

export type ExpandInput<T extends SlotRule> = {
  term: TermDates;
  breaks: Break[];
  rules: T[];
  from: string;
  to: string;
};

/**
 * turns weekly rules into real moments
 * the date and the time column are combined in the faculty timezone because
 * gluing them naively shifts every class by an hour when the clocks change
 */
export function expandOccurrences<T extends SlotRule>({
  term,
  breaks,
  rules,
  from,
  to,
}: ExpandInput<T>): Occurrence<T>[] {
  const zone = term.timezone;
  const termStart = calendarDay(term.startsOn, zone);
  const termEnd = calendarDay(term.endsOn, zone).endOf('day');

  const byDay = new Map<DayOfWeek, T[]>();
  for (const rule of rules) {
    const list = byDay.get(rule.dayOfWeek) ?? [];
    list.push(rule);
    byDay.set(rule.dayOfWeek, list);
  }

  const out: Occurrence<T>[] = [];
  let cursor = DateTime.fromISO(from, { zone }).startOf('day');
  const last = DateTime.fromISO(to, { zone }).startOf('day');

  while (cursor <= last) {
    const day = cursor;
    cursor = cursor.plus({ days: 1 });

    if (day < termStart || day > termEnd) continue;
    if (coveredByBreak(breaks, day, zone)) continue;

    const dayName = DAY_BY_ISO_WEEKDAY[day.weekday - 1];
    const todays = dayName ? byDay.get(dayName) : undefined;
    if (!todays) continue;

    const weekIndex = weekIndexOf(term, day);
    const parity = parityOf(term, day);

    for (const rule of todays) {
      if (rule.parity !== 'ambele' && rule.parity !== parity) continue;
      if (rule.startsWeek !== null && weekIndex < rule.startsWeek) continue;
      if (rule.endsWeek !== null && weekIndex > rule.endsWeek) continue;

      out.push({
        rule,
        date: day.toISODate() ?? '',
        weekIndex,
        startsAt: at(day, rule.startTime),
        endsAt: at(day, rule.endTime),
      });
    }
  }

  return out.sort((a, b) => a.startsAt.toMillis() - b.startsAt.toMillis());
}

function at(day: DateTime, hhmm: string): DateTime {
  const [hour, minute] = hhmm.split(':').map(Number);
  return day.set({ hour: hour ?? 0, minute: minute ?? 0, second: 0, millisecond: 0 });
}

/** the weeks touched by the range with their parity so the ui can label them */
export function weeksInRange(term: TermDates, from: string, to: string) {
  const zone = term.timezone;
  const weeks = [];
  let cursor = startOfWeek(DateTime.fromISO(from, { zone }));
  const last = startOfWeek(DateTime.fromISO(to, { zone }));

  while (cursor <= last) {
    weeks.push({
      index: weekIndexOf(term, cursor),
      parity: parityOf(term, cursor),
      startsOn: cursor.toISODate() ?? '',
      endsOn: cursor.plus({ days: 6 }).toISODate() ?? '',
    });
    cursor = cursor.plus({ weeks: 1 });
  }
  return weeks;
}
