import type { Prisma } from '@prisma/client';
import type {
  ReportCountsDto,
  ReportDto,
  ReportListMeta,
  ReportListQuery,
  ReportStatus,
  ReportTarget,
  ReportTargetDto,
} from '@campushub/shared';
import { prisma } from '../../lib/db.js';
import { authorSelect, toAuthor } from '../../lib/author.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';

const EXCERPT = 240;

export type TargetInfo = {
  title: string;
  excerpt: string | null;
  link: string | null;
  isDeleted: boolean;
  authorId: number | null;
};

const key = (type: ReportTarget, id: number) => `${type}:${id}`;

const cut = (text: string | null) =>
  text === null ? null : text.length > EXCERPT ? `${text.slice(0, EXCERPT)}…` : text;

/**
 * reports are polymorphic on purpose so the reference is resolved here with a switch
 * loading happens per type so a queue of thirty rows still costs four queries
 */
export async function loadTargets(
  facultyId: number,
  wanted: { targetType: ReportTarget; targetId: number }[],
): Promise<Map<string, TargetInfo>> {
  const ids = (type: ReportTarget) =>
    wanted.filter((w) => w.targetType === type).map((w) => w.targetId);
  const found = new Map<string, TargetInfo>();

  const postIds = ids('post');
  if (postIds.length > 0) {
    const rows = await prisma.forumPost.findMany({
      where: { id: { in: postIds }, category: { facultyId } },
      select: { id: true, title: true, content: true, isDeleted: true, authorId: true },
    });
    for (const row of rows) {
      found.set(key('post', row.id), {
        title: row.title,
        excerpt: cut(row.content),
        link: `/forum/${row.id}`,
        isDeleted: row.isDeleted,
        authorId: row.authorId,
      });
    }
  }

  const commentIds = ids('comment');
  if (commentIds.length > 0) {
    const rows = await prisma.forumComment.findMany({
      where: { id: { in: commentIds }, post: { category: { facultyId } } },
      select: {
        id: true,
        content: true,
        isDeleted: true,
        authorId: true,
        postId: true,
        post: { select: { title: true } },
      },
    });
    for (const row of rows) {
      found.set(key('comment', row.id), {
        title: `Comentariu la „${row.post.title}”`,
        excerpt: cut(row.content),
        link: `/forum/${row.postId}`,
        isDeleted: row.isDeleted,
        authorId: row.authorId,
      });
    }
  }

  const listingIds = ids('listing');
  if (listingIds.length > 0) {
    const rows = await prisma.listing.findMany({
      where: { id: { in: listingIds }, facultyId },
      select: { id: true, title: true, description: true, isDeleted: true, authorId: true },
    });
    for (const row of rows) {
      found.set(key('listing', row.id), {
        title: row.title,
        excerpt: cut(row.description),
        link: `/anunturi/${row.id}`,
        isDeleted: row.isDeleted,
        authorId: row.authorId,
      });
    }
  }

  const userIds = ids('user');
  if (userIds.length > 0) {
    const rows = await prisma.user.findMany({
      where: { id: { in: userIds }, facultyId },
      select: { id: true, displayName: true, isBanned: true, anonymizedAt: true },
    });
    for (const row of rows) {
      found.set(key('user', row.id), {
        title: row.anonymizedAt ? 'Utilizator șters' : row.displayName,
        excerpt: null,
        link: null,
        isDeleted: row.isBanned || row.anonymizedAt !== null,
        authorId: row.id,
      });
    }
  }

  return found;
}

export async function createReport(
  facultyId: number,
  reporterId: number,
  input: { targetType: ReportTarget; targetId: number; reason: string },
): Promise<{ id: number }> {
  const targets = await loadTargets(facultyId, [input]);
  const target = targets.get(key(input.targetType, input.targetId));
  if (!target) throw notFound('Conținutul raportat nu există');
  if (target.authorId === reporterId) throw badRequest('Nu poți raporta propriul conținut');

  const existing = await prisma.report.findUnique({
    where: {
      reporterId_targetType_targetId: {
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
      },
    },
    select: { id: true },
  });
  if (existing) throw conflict('Ai raportat deja acest conținut');

  return prisma.report.create({
    data: {
      reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
    },
    select: { id: true },
  });
}

const reportInclude = {
  reporter: { select: authorSelect },
  handler: { select: authorSelect },
} satisfies Prisma.ReportInclude;

export async function listReports(
  facultyId: number,
  query: ReportListQuery,
): Promise<{ data: ReportDto[]; meta: ReportListMeta }> {
  const where: Prisma.ReportWhereInput = { status: query.status };

  const [rows, total, grouped] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: reportInclude,
    }),
    prisma.report.count({ where }),
    prisma.report.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const targets = await loadTargets(facultyId, rows);
  const counts: ReportCountsDto = { open: 0, resolved: 0, dismissed: 0 };
  for (const row of grouped) counts[row.status] = row._count._all;

  return {
    data: rows.map((row) => toReportDto(row, targets.get(key(row.targetType, row.targetId)))),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      has_next: query.page * query.limit < total,
      counts,
    },
  };
}

export async function resolveReport(
  facultyId: number,
  reportId: number,
  moderatorId: number,
  input: { status: Exclude<ReportStatus, 'open'>; deleteTarget: boolean },
): Promise<ReportDto> {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw notFound('Raportul nu există');

  const targets = await loadTargets(facultyId, [report]);
  const target = targets.get(key(report.targetType, report.targetId));

  if (input.deleteTarget) {
    if (!target) throw notFound('Conținutul raportat nu mai există');
    await deleteTarget(report.targetType, report.targetId, target, moderatorId);
  }

  // every open report on the same target gets the same answer the queue holds one row per problem
  await prisma.report.updateMany({
    where: { targetType: report.targetType, targetId: report.targetId, status: 'open' },
    data: { status: input.status, handledBy: moderatorId, handledAt: new Date() },
  });

  const after = await prisma.report.findUniqueOrThrow({
    where: { id: reportId },
    include: reportInclude,
  });
  const fresh = await loadTargets(facultyId, [after]);
  return toReportDto(after, fresh.get(key(after.targetType, after.targetId)));
}

/** logical delete everywhere the thread keeps its shape and the author finds out */
async function deleteTarget(
  type: ReportTarget,
  id: number,
  target: TargetInfo,
  moderatorId: number,
): Promise<void> {
  switch (type) {
    case 'post':
      await prisma.forumPost.update({ where: { id }, data: { isDeleted: true } });
      break;
    case 'comment':
      await prisma.forumComment.update({ where: { id }, data: { isDeleted: true } });
      break;
    case 'listing':
      await prisma.listing.update({ where: { id }, data: { isDeleted: true } });
      break;
    case 'user':
      // banning a person is a different decision than removing a piece of content
      throw badRequest('Un cont nu se șterge din panoul de moderare');
  }

  if (target.authorId && target.authorId !== moderatorId) {
    await prisma.notification.create({
      data: {
        userId: target.authorId,
        type: 'content_removed',
        title: 'Un conținut al tău a fost șters',
        body: `„${target.title}” a fost șters de un moderator.`,
        link: target.link,
      },
    });
  }
}

function toReportDto(
  row: Prisma.ReportGetPayload<{ include: typeof reportInclude }>,
  target: TargetInfo | undefined,
): ReportDto {
  const preview: ReportTargetDto = target
    ? {
        title: target.title,
        excerpt: target.excerpt,
        link: target.link,
        isDeleted: target.isDeleted,
      }
    : null;

  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    status: row.status,
    reporter: toAuthor(row.reporter),
    handledBy: toAuthor(row.handler),
    handledAt: row.handledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    target: preview,
  };
}
