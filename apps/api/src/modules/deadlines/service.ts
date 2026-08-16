import type { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import type { DeadlineDto, DeadlineListQuery, Paginated } from '@campushub/shared';
import { prisma } from '../../lib/db.js';
import { authorSelect, toAuthor } from '../../lib/author.js';
import { notFound } from '../../lib/errors.js';

const deadlineInclude = {
  author: { select: authorSelect },
  subject: { select: { id: true, name: true, shortName: true } },
  group: { select: { id: true, name: true } },
} satisfies Prisma.DeadlineInclude;

type DeadlineRow = Prisma.DeadlineGetPayload<{ include: typeof deadlineInclude }>;

export type Viewer = { id: number | null; groupId: number | null };

/** a deadline without a group belongs to the whole faculty and is shown to everyone */
function scope(facultyId: number, groupId: number | null): Prisma.DeadlineWhereInput {
  return {
    facultyId,
    isDeleted: false,
    OR: [{ groupId: null }, ...(groupId ? [{ groupId }] : [])],
  };
}

export async function listDeadlines(
  facultyId: number,
  query: DeadlineListQuery,
  viewer: Viewer,
  zone: string,
): Promise<Paginated<DeadlineDto>> {
  const from = query.from
    ? DateTime.fromISO(query.from, { zone }).startOf('day').toJSDate()
    : new Date();
  const to = query.to ? DateTime.fromISO(query.to, { zone }).endOf('day').toJSDate() : null;

  const where: Prisma.DeadlineWhereInput = {
    ...scope(facultyId, viewer.groupId),
    dueAt: { gte: from, ...(to ? { lte: to } : {}) },
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.mine === 'true' && viewer.id ? { createdBy: viewer.id } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.deadline.findMany({
      where,
      orderBy: { dueAt: 'asc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: deadlineInclude,
    }),
    prisma.deadline.count({ where }),
  ]);

  return {
    data: rows.map((row) => toDto(row, viewer.id)),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      has_next: query.page * query.limit < total,
    },
  };
}

export async function deadlineById(
  facultyId: number,
  id: number,
  viewerId: number | null,
): Promise<DeadlineDto> {
  const row = await prisma.deadline.findFirst({
    where: { id, facultyId, isDeleted: false },
    include: deadlineInclude,
  });
  if (!row) throw notFound('Termenul nu există');
  return toDto(row, viewerId);
}

function toDto(row: DeadlineRow, viewerId: number | null): DeadlineDto {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    dueAt: row.dueAt.toISOString(),
    description: row.description,
    subject: row.subject,
    group: row.group,
    author: toAuthor(row.author),
    isMine: viewerId !== null && row.createdBy === viewerId,
    createdAt: row.createdAt.toISOString(),
  };
}
