import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  expandOccurrences,
  parityOf,
  weekIndexOf,
  weeksInRange,
  type SlotRule,
  type TermDates,
} from './occurrences.js';

// a date column holds a calendar day so the fixtures are written at utc midnight
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const term: TermDates = {
  startsOn: day('2026-10-05'),
  endsOn: day('2027-01-29'),
  firstWeekParity: 'impar',
  timezone: 'Europe/Bucharest',
};

const rule = (over: Partial<SlotRule> = {}): SlotRule => ({
  id: 1,
  dayOfWeek: 'luni',
  startTime: '10:00',
  endTime: '12:00',
  parity: 'ambele',
  startsWeek: null,
  endsWeek: null,
  ...over,
});

const local = (iso: string) => DateTime.fromISO(iso, { zone: term.timezone });

describe('weekIndexOf', () => {
  it('counts the first week of the term as week one', () => {
    expect(weekIndexOf(term, local('2026-10-05'))).toBe(1);
    expect(weekIndexOf(term, local('2026-10-11'))).toBe(1);
    expect(weekIndexOf(term, local('2026-10-12'))).toBe(2);
  });
});

describe('parityOf', () => {
  it('alternates from the parity entered by hand', () => {
    expect(parityOf(term, local('2026-10-07'))).toBe('impar');
    expect(parityOf(term, local('2026-10-14'))).toBe('par');
    expect(parityOf(term, local('2026-10-21'))).toBe('impar');
  });

  it('follows the other parity when the term starts on an even week', () => {
    const even: TermDates = { ...term, firstWeekParity: 'par' };
    expect(parityOf(even, local('2026-10-07'))).toBe('par');
    expect(parityOf(even, local('2026-10-14'))).toBe('impar');
  });
});

describe('expandOccurrences', () => {
  it('places a weekly rule on every matching day of the range', () => {
    const found = expandOccurrences({
      term,
      breaks: [],
      rules: [rule()],
      from: '2026-10-05',
      to: '2026-10-26',
    });
    expect(found.map((o) => o.date)).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
  });

  it('keeps only the weeks whose parity matches', () => {
    const found = expandOccurrences({
      term,
      breaks: [],
      rules: [rule({ parity: 'par' })],
      from: '2026-10-05',
      to: '2026-10-26',
    });
    expect(found.map((o) => o.date)).toEqual(['2026-10-12', '2026-10-26']);
  });

  it('skips the days covered by a break', () => {
    const found = expandOccurrences({
      term,
      breaks: [{ startsOn: day('2026-10-12'), endsOn: day('2026-10-18') }],
      rules: [rule()],
      from: '2026-10-05',
      to: '2026-10-19',
    });
    expect(found.map((o) => o.date)).toEqual(['2026-10-05', '2026-10-19']);
  });

  it('stays inside the term', () => {
    const found = expandOccurrences({
      term,
      breaks: [],
      rules: [rule()],
      from: '2026-09-21',
      to: '2026-10-12',
    });
    expect(found.map((o) => o.date)).toEqual(['2026-10-05', '2026-10-12']);
  });

  it('honours a class that covers only part of the semester', () => {
    const found = expandOccurrences({
      term,
      breaks: [],
      rules: [rule({ startsWeek: 3 }), rule({ id: 2, endsWeek: 2, startTime: '14:00', endTime: '16:00' })],
      from: '2026-10-05',
      to: '2026-10-26',
    });
    expect(found.filter((o) => o.rule.id === 1).map((o) => o.date)).toEqual([
      '2026-10-19',
      '2026-10-26',
    ]);
    expect(found.filter((o) => o.rule.id === 2).map((o) => o.date)).toEqual([
      '2026-10-05',
      '2026-10-12',
    ]);
  });

  it('keeps the wall clock hour across the change to winter time', () => {
    const found = expandOccurrences({
      term,
      breaks: [],
      rules: [rule()],
      from: '2026-10-19',
      to: '2026-10-26',
    });
    // the clocks go back on 25 october so the same 10:00 class is a different instant
    expect(found[0]?.startsAt.toISO()).toBe('2026-10-19T10:00:00.000+03:00');
    expect(found[1]?.startsAt.toISO()).toBe('2026-10-26T10:00:00.000+02:00');
  });

  it('sorts by moment so the calendar needs no second pass', () => {
    const found = expandOccurrences({
      term,
      breaks: [],
      rules: [
        rule({ id: 1, startTime: '16:00', endTime: '18:00' }),
        rule({ id: 2, startTime: '08:00', endTime: '10:00' }),
      ],
      from: '2026-10-05',
      to: '2026-10-05',
    });
    expect(found.map((o) => o.rule.id)).toEqual([2, 1]);
  });
});

describe('weeksInRange', () => {
  it('labels every week the range touches', () => {
    expect(weeksInRange(term, '2026-10-05', '2026-10-18')).toEqual([
      { index: 1, parity: 'impar', startsOn: '2026-10-05', endsOn: '2026-10-11' },
      { index: 2, parity: 'par', startsOn: '2026-10-12', endsOn: '2026-10-18' },
    ]);
  });
});
