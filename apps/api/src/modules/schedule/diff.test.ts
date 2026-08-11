import { describe, expect, it } from 'vitest';
import { diffSchedule, removalRatio, type ExistingSlot, type IncomingSlot } from './diff.js';

const base = {
  subjectRaw: 'Rețele de Calculatoare',
  roomRaw: 'C107',
  professor: 'Andrei Lupu',
  startTime: '10:00',
  endTime: '12:00',
  startsWeek: null,
  endsWeek: null,
};

const existing = (id: number, key: string, contentHash: string): ExistingSlot => ({
  ...base,
  id,
  key,
  groupId: 1,
  contentHash,
});

const incoming = (key: string, contentHash: string, over: Partial<IncomingSlot> = {}): IncomingSlot => ({
  ...base,
  key,
  groupId: 1,
  subgroup: 0,
  dayOfWeek: 'luni',
  classType: 'curs',
  parity: 'ambele',
  subjectId: null,
  roomId: null,
  contentHash,
  ...over,
});

describe('diffSchedule', () => {
  it('adds a slot that was not there', () => {
    const diff = diffSchedule([], [incoming('a', 'h1')]);
    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(0);
  });

  it('reports a changed attribute inside the same slot', () => {
    const diff = diffSchedule([existing(7, 'a', 'h1')], [incoming('a', 'h2')]);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]?.existing.id).toBe(7);
    expect(diff.added).toHaveLength(0);
  });

  it('leaves an identical slot alone', () => {
    const diff = diffSchedule([existing(7, 'a', 'h1')], [incoming('a', 'h1')]);
    expect(diff.unchanged).toHaveLength(1);
    expect(diff.changed).toHaveLength(0);
  });

  it('marks a slot missing from the source as removed', () => {
    const diff = diffSchedule([existing(7, 'a', 'h1')], []);
    expect(diff.removed.map((r) => r.id)).toEqual([7]);
  });

  it('keeps the first of two rows claiming the same slot', () => {
    const diff = diffSchedule([], [incoming('a', 'h1'), incoming('a', 'h2')]);
    expect(diff.added).toHaveLength(1);
    expect(diff.duplicates).toHaveLength(1);
  });

  it('treats two parallel labs as different slots', () => {
    const diff = diffSchedule(
      [],
      [incoming('1|1|luni|12:00|laborator|ambele', 'h1'), incoming('1|2|luni|12:00|laborator|ambele', 'h2')],
    );
    expect(diff.added).toHaveLength(2);
  });
});

describe('removalRatio', () => {
  it('is zero when nothing existed', () => {
    expect(removalRatio(diffSchedule([], []), 0)).toBe(0);
  });

  it('measures the share of slots the source stopped reporting', () => {
    const before = [existing(1, 'a', 'h'), existing(2, 'b', 'h'), existing(3, 'c', 'h'), existing(4, 'd', 'h')];
    const diff = diffSchedule(before, [incoming('a', 'h')]);
    expect(removalRatio(diff, before.length)).toBe(0.75);
  });
});
