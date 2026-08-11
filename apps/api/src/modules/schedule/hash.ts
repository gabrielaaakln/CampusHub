import { createHash } from 'node:crypto';

/** covers exactly the attributes that may change inside one slot */
export function contentHash(parts: {
  subjectRaw: string;
  roomRaw?: string | null;
  professor?: string | null;
  endTime: string;
  startsWeek?: number | null;
  endsWeek?: number | null;
}): string {
  return createHash('sha256')
    .update(
      [
        parts.subjectRaw,
        parts.roomRaw ?? '',
        parts.professor ?? '',
        parts.endTime,
        parts.startsWeek ?? '',
        parts.endsWeek ?? '',
      ].join('|'),
    )
    .digest('hex');
}
