import { describe, expect, it } from 'vitest';
import type { CalendarItem } from '@campushub/shared';
import { toIcs } from './ics.js';

const classItem: CalendarItem = {
  id: 'sched:412:2026-08-03',
  kind: 'class',
  title: 'Programare web',
  type: 'laborator',
  startsAt: '2026-08-03T16:00:00.000+03:00',
  endsAt: '2026-08-03T18:00:00.000+03:00',
  professor: 'ș.l.dr.ing. A. Archip',
  group: '1306',
  room: { id: 17, number: 'C1-4', building: 'Corp C' },
};

describe('ics export', () => {
  it('writes a calendar with one event per item', () => {
    const out = toIcs([classItem], 'CampusHub 1306');
    expect(out.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(out.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(out).toContain('UID:sched:412:2026-08-03@campushub');
  });

  it('converts every moment to utc so no timezone block is needed', () => {
    const out = toIcs([classItem], 'CampusHub');
    // 16:00 in Bucharest summer time is 13:00 utc
    expect(out).toContain('DTSTART:20260803T130000Z');
    expect(out).toContain('DTEND:20260803T150000Z');
    expect(out).not.toContain('BEGIN:VTIMEZONE');
  });

  it('gives a deadline a length because a zero length event is hidden by some clients', () => {
    const out = toIcs(
      [
        {
          id: 'deadline:88',
          kind: 'deadline',
          title: 'Tema 2',
          startsAt: '2026-08-09T23:59:00.000+03:00',
          endsAt: null,
        },
      ],
      'CampusHub',
    );
    expect(out).toContain('DTSTART:20260809T205900Z');
    expect(out).toContain('DTEND:20260809T212900Z');
  });

  it('escapes the characters that would end a property early', () => {
    const out = toIcs(
      [{ ...classItem, title: 'Analiză; algebră, partea 1', id: 'x' }],
      'CampusHub',
    );
    expect(out).toContain('SUMMARY:Analiză\\; algebră\\, partea 1');
  });

  it('folds a long line and keeps the continuation readable', () => {
    const long = 'Disciplină cu un titlu foarte lung '.repeat(4);
    const out = toIcs([{ ...classItem, title: long, id: 'y' }], 'CampusHub');
    const lines = out.split('\r\n');
    expect(lines.every((line) => Buffer.from(line, 'utf8').length <= 75)).toBe(true);
    expect(out).toContain('\r\n ');
  });

  it('puts the room in LOCATION and the professor in DESCRIPTION', () => {
    const out = toIcs([classItem], 'CampusHub');
    expect(out).toContain('LOCATION:C1-4\\, Corp C');
    expect(out).toContain('DESCRIPTION:laborator · ș.l.dr.ing. A. Archip · grupa 1306');
  });
});
