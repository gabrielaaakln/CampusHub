import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Prisma, ScheduleSource } from '@prisma/client';
import { slotKey, type RawEntry, type ScheduleImportDto } from '@campushub/shared';
import { config } from '../../config.js';
import { prisma } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { contentHash } from './hash.js';
import { attributesOf, diffSchedule, removalRatio, type ExistingSlot, type IncomingSlot } from './diff.js';
import { ScheduleResolver, hhmm, timeOfDay } from './resolve.js';
import type { RawSource, ScheduleAdapter, TermRef } from './types.js';

// when the source breaks and returns 12 rows instead of 400 nothing is deactivated
export const REMOVAL_GUARD = 0.3;

export type ImportReport = ScheduleImportDto;

export async function runImport(
  term: TermRef,
  adapter: ScheduleAdapter,
  source: ScheduleSource,
): Promise<ImportReport> {
  const run = await prisma.scrapeRun.create({
    data: { facultyId: term.facultyId, termId: term.id, adapter: adapter.name, source },
    select: { id: true, startedAt: true },
  });

  const report: ImportReport = {
    runId: run.id,
    status: 'failed',
    found: 0,
    added: 0,
    changed: 0,
    removed: 0,
    unresolvedSubjects: [],
    errors: [],
  };

  try {
    const raw = await adapter.fetch(term);
    const snapshotPath = await saveSnapshot(run.id, raw);
    const parsed = await adapter.parse(raw);
    report.found = parsed.entries.length;
    report.errors = parsed.errors.map((e) => `linia ${e.line}: ${e.message}`);

    // an empty parse is a broken source not an empty semester
    if (parsed.entries.length === 0) {
      await finish(run.id, report, snapshotPath, 'Sursa nu a returnat nicio intrare');
      return report;
    }

    const { slots, unresolved, skipped } = await normalize(term, parsed.entries);
    report.unresolvedSubjects = unresolved;
    report.errors.push(...skipped);

    const existing = await loadExisting(term.id);
    const diff = diffSchedule(existing, slots);
    for (const dup of diff.duplicates) {
      report.errors.push(`slot duplicat în sursă: ${dup.key}`);
    }

    const ratio = removalRatio(diff, existing.length);
    const guardTripped = ratio > REMOVAL_GUARD;
    if (guardTripped) {
      report.errors.push(
        `supapa de siguranță: ${Math.round(ratio * 100)}% din sloturi lipsesc din sursă, nu s-a dezactivat nimic`,
      );
      logger.error({ runId: run.id, ratio }, 'schedule import guard tripped');
    }

    await prisma.$transaction(
      async (tx) => {
        await applyDiff(tx, term, run, diff, guardTripped, source, report);
      },
      { timeout: 60_000 },
    );

    report.status = guardTripped || report.errors.length > 0 ? 'partial' : 'success';
    await finish(run.id, report, snapshotPath, report.errors.join('\n') || null);
    return report;
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
    await finish(run.id, report, null, report.errors.join('\n'));
    throw err;
  }
}

async function normalize(
  term: TermRef,
  entries: RawEntry[],
): Promise<{ slots: IncomingSlot[]; unresolved: string[]; skipped: string[] }> {
  const resolver = await ScheduleResolver.load(term.facultyId);
  const slots: IncomingSlot[] = [];
  const unresolved = new Set<string>();
  const skipped: string[] = [];

  for (const entry of entries) {
    const groupId = resolver.group(entry.groupName);
    // an unknown group cannot be guessed the row is reported and left out
    if (groupId === undefined) {
      skipped.push(`grupă necunoscută: ${entry.groupName}`);
      continue;
    }

    const subjectId = await resolver.subject(entry.subject);
    if (subjectId === null) unresolved.add(entry.subject);

    slots.push({
      key: slotKey({
        groupId,
        subgroup: entry.subgroup,
        day: entry.day,
        startTime: entry.startTime,
        classType: entry.classType,
        parity: entry.parity,
      }),
      groupId,
      subgroup: entry.subgroup,
      dayOfWeek: entry.day,
      classType: entry.classType,
      parity: entry.parity,
      subjectId,
      subjectRaw: entry.subject,
      roomId: resolver.room(entry.room),
      roomRaw: entry.room ?? null,
      professor: entry.professor ?? null,
      startTime: entry.startTime,
      endTime: entry.endTime,
      startsWeek: entry.startsWeek ?? null,
      endsWeek: entry.endsWeek ?? null,
      contentHash: contentHash({
        subjectRaw: entry.subject,
        roomRaw: entry.room,
        professor: entry.professor,
        endTime: entry.endTime,
        startsWeek: entry.startsWeek,
        endsWeek: entry.endsWeek,
      }),
    });
  }

  return { slots, unresolved: [...unresolved], skipped };
}

async function loadExisting(termId: number): Promise<ExistingSlot[]> {
  const rows = await prisma.scheduleEntry.findMany({
    where: { termId, isActive: true },
    select: {
      id: true,
      groupId: true,
      subgroup: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      classType: true,
      parity: true,
      startsWeek: true,
      endsWeek: true,
      subjectRaw: true,
      roomRaw: true,
      professor: true,
      contentHash: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    key: slotKey({
      groupId: r.groupId,
      subgroup: r.subgroup,
      day: r.dayOfWeek,
      startTime: hhmm(r.startTime),
      classType: r.classType,
      parity: r.parity,
    }),
    subjectRaw: r.subjectRaw,
    roomRaw: r.roomRaw,
    professor: r.professor,
    startTime: hhmm(r.startTime),
    endTime: hhmm(r.endTime),
    startsWeek: r.startsWeek,
    endsWeek: r.endsWeek,
    contentHash: r.contentHash,
  }));
}

async function applyDiff(
  tx: Prisma.TransactionClient,
  term: TermRef,
  run: { id: number; startedAt: Date },
  diff: ReturnType<typeof diffSchedule>,
  guardTripped: boolean,
  source: ScheduleSource,
  report: ImportReport,
): Promise<void> {
  const touchedGroups = new Set<number>();
  const changes: Prisma.ScheduleChangeCreateManyInput[] = [];

  for (const slot of diff.added) {
    const created = await tx.scheduleEntry.create({
      data: {
        termId: term.id,
        groupId: slot.groupId,
        subgroup: slot.subgroup,
        dayOfWeek: slot.dayOfWeek,
        startTime: timeOfDay(slot.startTime),
        endTime: timeOfDay(slot.endTime),
        classType: slot.classType,
        parity: slot.parity,
        startsWeek: slot.startsWeek,
        endsWeek: slot.endsWeek,
        subjectId: slot.subjectId,
        subjectRaw: slot.subjectRaw,
        roomId: slot.roomId,
        roomRaw: slot.roomRaw,
        professor: slot.professor,
        source,
        contentHash: slot.contentHash,
        lastSeenAt: run.startedAt,
      },
      select: { id: true },
    });
    changes.push({
      runId: run.id,
      entryId: created.id,
      groupId: slot.groupId,
      kind: 'added',
      after: attributesOf(slot) as Prisma.InputJsonValue,
    });
    touchedGroups.add(slot.groupId);
  }

  for (const { existing, incoming } of diff.changed) {
    await tx.scheduleEntry.update({
      where: { id: existing.id },
      data: {
        subjectId: incoming.subjectId,
        subjectRaw: incoming.subjectRaw,
        roomId: incoming.roomId,
        roomRaw: incoming.roomRaw,
        professor: incoming.professor,
        endTime: timeOfDay(incoming.endTime),
        startsWeek: incoming.startsWeek,
        endsWeek: incoming.endsWeek,
        source,
        contentHash: incoming.contentHash,
        lastSeenAt: run.startedAt,
      },
    });
    changes.push({
      runId: run.id,
      entryId: existing.id,
      groupId: incoming.groupId,
      kind: 'changed',
      before: attributesOf(existing) as Prisma.InputJsonValue,
      after: attributesOf(incoming) as Prisma.InputJsonValue,
    });
    touchedGroups.add(incoming.groupId);
  }

  if (diff.unchanged.length > 0) {
    await tx.scheduleEntry.updateMany({
      where: { id: { in: diff.unchanged.map((u) => u.id) } },
      data: { lastSeenAt: run.startedAt },
    });
  }

  if (!guardTripped && diff.removed.length > 0) {
    await tx.scheduleEntry.updateMany({
      where: { id: { in: diff.removed.map((r) => r.id) } },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    for (const gone of diff.removed) {
      changes.push({
        runId: run.id,
        entryId: gone.id,
        groupId: gone.groupId,
        kind: 'removed',
        before: attributesOf(gone) as Prisma.InputJsonValue,
      });
      touchedGroups.add(gone.groupId);
    }
    report.removed = diff.removed.length;
  }

  report.added = diff.added.length;
  report.changed = diff.changed.length;

  if (changes.length > 0) await tx.scheduleChange.createMany({ data: changes });
  await notifyGroups(tx, touchedGroups, report);
}

// one notification per group per run not one per row
async function notifyGroups(
  tx: Prisma.TransactionClient,
  groupIds: Set<number>,
  report: ImportReport,
): Promise<void> {
  if (groupIds.size === 0) return;

  const users = await tx.user.findMany({
    where: { groupId: { in: [...groupIds] }, isBanned: false, anonymizedAt: null },
    select: { id: true },
  });
  if (users.length === 0) return;

  const parts: string[] = [];
  if (report.added > 0) parts.push(`${report.added} ore noi`);
  if (report.changed > 0) parts.push(`${report.changed} modificate`);
  if (report.removed > 0) parts.push(`${report.removed} scoase`);

  await tx.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: 'schedule_changed',
      title: 'Orarul grupei tale s-a schimbat',
      body: parts.join(', ') || 'Orarul a fost actualizat.',
      link: '/orar',
    })),
  });
}

const EXTENSIONS: Record<string, string> = {
  'text/csv': '.csv',
  'text/html': '.html',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

function extensionOf(source: RawSource): string {
  const known = EXTENSIONS[source.contentType.split(';')[0]!.trim().toLowerCase()];
  if (known) return known;
  return /\.[a-z0-9]{2,5}$/i.exec(source.filename ?? '')?.[0]?.toLowerCase() ?? '.bin';
}

async function saveSnapshot(runId: number, source: RawSource): Promise<string | null> {
  try {
    await mkdir(config.paths.snapshotDir, { recursive: true });
    const path = join(config.paths.snapshotDir, `run-${runId}${extensionOf(source)}`);
    await writeFile(path, source.buffer);
    return path;
  } catch (err) {
    logger.warn({ err, runId }, 'could not save the raw snapshot');
    return null;
  }
}

async function finish(
  runId: number,
  report: ImportReport,
  snapshotPath: string | null,
  errorMessage: string | null,
): Promise<void> {
  await prisma.scrapeRun.update({
    where: { id: runId },
    data: {
      finishedAt: new Date(),
      status: report.status,
      entriesFound: report.found,
      entriesAdded: report.added,
      entriesChanged: report.changed,
      entriesRemoved: report.removed,
      rawSnapshotPath: snapshotPath,
      errorMessage,
    },
  });
}
