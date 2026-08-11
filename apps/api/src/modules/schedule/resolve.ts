import { norm, normCompact } from '@campushub/shared';
import { prisma } from '../../lib/db.js';

const TRIGRAM_THRESHOLD = 0.45;

// resolves free text against real rows an unresolved subject is not an error
export class ScheduleResolver {
  private constructor(
    private readonly facultyId: number,
    private readonly groups: Map<string, number>,
    private readonly subjects: Map<string, number>,
    private readonly rooms: Map<string, number>,
  ) {}

  static async load(facultyId: number): Promise<ScheduleResolver> {
    const [groups, subjects, subjectAliases, rooms, roomAliases] = await Promise.all([
      prisma.studyGroup.findMany({ where: { facultyId }, select: { id: true, nameNorm: true } }),
      prisma.subject.findMany({ where: { facultyId }, select: { id: true, nameNorm: true } }),
      prisma.subjectAlias.findMany({
        where: { subject: { facultyId } },
        select: { subjectId: true, aliasNorm: true },
      }),
      prisma.room.findMany({
        where: { floor: { building: { facultyId } } },
        select: { id: true, roomNumberNorm: true },
      }),
      prisma.roomAlias.findMany({
        where: { room: { floor: { building: { facultyId } } } },
        select: { roomId: true, aliasNorm: true },
      }),
    ]);

    const subjectMap = new Map<string, number>();
    for (const s of subjects) subjectMap.set(s.nameNorm, s.id);
    // aliases never overwrite a real name
    for (const a of subjectAliases) if (!subjectMap.has(a.aliasNorm)) subjectMap.set(a.aliasNorm, a.subjectId);

    const roomMap = new Map<string, number>();
    for (const r of rooms) roomMap.set(normCompact(r.roomNumberNorm), r.id);
    for (const a of roomAliases) {
      const key = normCompact(a.aliasNorm);
      if (!roomMap.has(key)) roomMap.set(key, a.roomId);
    }

    return new ScheduleResolver(
      facultyId,
      new Map(groups.map((g) => [g.nameNorm, g.id])),
      subjectMap,
      roomMap,
    );
  }

  group(name: string): number | undefined {
    return this.groups.get(norm(name));
  }

  room(raw: string | undefined): number | null {
    if (!raw) return null;
    return this.rooms.get(normCompact(raw)) ?? null;
  }

  /** exact name then alias then trigram similarity */
  async subject(name: string): Promise<number | null> {
    const key = norm(name);
    const exact = this.subjects.get(key);
    if (exact !== undefined) return exact;

    const rows = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM subjects
      WHERE faculty_id = ${this.facultyId}
        AND similarity(name_norm, ${key}) > ${TRIGRAM_THRESHOLD}
      ORDER BY similarity(name_norm, ${key}) DESC
      LIMIT 1`;
    const found = rows[0]?.id ?? null;
    if (found !== null) this.subjects.set(key, found);
    return found;
  }
}

/** time columns carry no date prisma reads the utc clock part of a date */
export function timeOfDay(hhmm: string): Date {
  const [h, m] = hhmm.split(':');
  return new Date(Date.UTC(1970, 0, 1, Number(h), Number(m)));
}

export function hhmm(value: Date): string {
  return value.toISOString().slice(11, 16);
}
