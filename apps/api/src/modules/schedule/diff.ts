import type { ClassType, DayOfWeek, WeekParity } from '@campushub/shared';

export type SlotAttributes = {
  subjectRaw: string;
  roomRaw: string | null;
  professor: string | null;
  startTime: string;
  endTime: string;
  startsWeek: number | null;
  endsWeek: number | null;
  contentHash: string;
};

export type IncomingSlot = SlotAttributes & {
  key: string;
  groupId: number;
  subgroup: number;
  dayOfWeek: DayOfWeek;
  classType: ClassType;
  parity: WeekParity;
  subjectId: number | null;
  roomId: number | null;
};

export type ExistingSlot = SlotAttributes & {
  id: number;
  key: string;
  groupId: number;
};

export type ScheduleDiff = {
  added: IncomingSlot[];
  changed: { existing: ExistingSlot; incoming: IncomingSlot }[];
  unchanged: ExistingSlot[];
  removed: ExistingSlot[];
  duplicates: IncomingSlot[];
};

// in memory because a semester is a few thousand rows and before after must be exact
export function diffSchedule(existing: ExistingSlot[], incoming: IncomingSlot[]): ScheduleDiff {
  const byKey = new Map(existing.map((e) => [e.key, e]));
  const seen = new Set<string>();

  const diff: ScheduleDiff = {
    added: [],
    changed: [],
    unchanged: [],
    removed: [],
    duplicates: [],
  };

  for (const slot of incoming) {
    // two rows for the same slot would collide on uq_schedule_slot
    if (seen.has(slot.key)) {
      diff.duplicates.push(slot);
      continue;
    }
    seen.add(slot.key);

    const match = byKey.get(slot.key);
    if (!match) diff.added.push(slot);
    else if (match.contentHash !== slot.contentHash) diff.changed.push({ existing: match, incoming: slot });
    else diff.unchanged.push(match);
  }

  for (const entry of existing) {
    if (!seen.has(entry.key)) diff.removed.push(entry);
  }

  return diff;
}

/** share of active slots the source stopped reporting */
export function removalRatio(diff: ScheduleDiff, existingCount: number): number {
  if (existingCount === 0) return 0;
  return diff.removed.length / existingCount;
}

export function attributesOf(slot: SlotAttributes): Record<string, unknown> {
  return {
    subject: slot.subjectRaw,
    room: slot.roomRaw,
    professor: slot.professor,
    startTime: slot.startTime,
    endTime: slot.endTime,
    startsWeek: slot.startsWeek,
    endsWeek: slot.endsWeek,
  };
}
