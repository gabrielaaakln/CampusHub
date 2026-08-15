import type {
  ReportTarget,
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

