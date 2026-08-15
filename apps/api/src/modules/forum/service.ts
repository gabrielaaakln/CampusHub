import type { Prisma } from '@prisma/client';
import type { ForumCommentDto, ForumPostDto, PostListQuery } from '@campushub/shared';
import { prisma } from '../../lib/db.js';
import { authorSelect, toAuthor } from '../../lib/author.js';
import { notFound } from '../../lib/errors.js';

const postInclude = {
  author: { select: authorSelect },
  category: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
} satisfies Prisma.ForumPostInclude;

type PostRow = Prisma.ForumPostGetPayload<{ include: typeof postInclude }>;

export async function listCategories(facultyId: number) {
  const rows = await prisma.forumCategory.findMany({
    where: { facultyId },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    include: { _count: { select: { posts: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    postCount: row._count.posts,
  }));
}

export async function listPosts(facultyId: number, query: PostListQuery, viewerId: number | null) {
  const where: Prisma.ForumPostWhereInput = {
    isDeleted: false,
    category: { facultyId },
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.q ? { title: { contains: query.q, mode: 'insensitive' as const } } : {}),
  };

  const orderBy: Prisma.ForumPostOrderByWithRelationInput[] =
    query.sort === 'top' ? [{ score: 'desc' }, { createdAt: 'desc' }] : [{ createdAt: 'desc' }];

  const [rows, total] = await Promise.all([
    prisma.forumPost.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: postInclude,
    }),
    prisma.forumPost.count({ where }),
  ]);

  const votes = await myPostVotes(
    viewerId,
    rows.map((r) => r.id),
  );

  return {
    data: rows.map((row) => toPostDto(row, votes.get(row.id) ?? 0)),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      has_next: query.page * query.limit < total,
    },
  };
}

export async function postById(
  facultyId: number,
  id: number,
  viewerId: number | null,
): Promise<ForumPostDto> {
  const post = await prisma.forumPost.findFirst({
    where: { id, category: { facultyId } },
    include: postInclude,
  });
  if (!post) throw notFound('Postarea nu există');

  const votes = await myPostVotes(viewerId, [post.id]);
  return toPostDto(post, votes.get(post.id) ?? 0);
}

export async function listComments(
  postId: number,
  viewerId: number | null,
): Promise<ForumCommentDto[]> {
  const rows = await prisma.forumComment.findMany({
    where: { postId },
    orderBy: [{ createdAt: 'asc' }],
    include: { author: { select: authorSelect } },
  });

  const votes = viewerId
    ? await prisma.commentVote
        .findMany({
          where: { userId: viewerId, commentId: { in: rows.map((r) => r.id) } },
          select: { commentId: true, value: true },
        })
        .then((v) => new Map(v.map((row) => [row.commentId, row.value])))
    : new Map<number, number>();

  return rows.map((row) => ({
    id: row.id,
    postId: row.postId,
    parentCommentId: row.parentCommentId,
    depth: row.depth,
    // a deleted comment keeps its place so the thread does not break
    content: row.isDeleted ? 'Comentariu șters' : row.content,
    author: row.isDeleted ? null : toAuthor(row.author),
    score: row.score,
    myVote: votes.get(row.id) ?? 0,
    isDeleted: row.isDeleted,
    createdAt: row.createdAt.toISOString(),
  }));
}

async function myPostVotes(viewerId: number | null, postIds: number[]): Promise<Map<number, number>> {
  if (!viewerId || postIds.length === 0) return new Map();
  const rows = await prisma.postVote.findMany({
    where: { userId: viewerId, postId: { in: postIds } },
    select: { postId: true, value: true },
  });
  return new Map(rows.map((row) => [row.postId, row.value]));
}

/** 0 deletes the row so the trigger that keeps the score sees the change */
export async function votePost(userId: number, postId: number, value: number): Promise<number> {
  const post = await prisma.forumPost.findUnique({ where: { id: postId }, select: { id: true } });
  if (!post) throw notFound('Postarea nu există');

  if (value === 0) {
    await prisma.postVote.deleteMany({ where: { userId, postId } });
  } else {
    await prisma.postVote.upsert({
      where: { userId_postId: { userId, postId } },
      create: { userId, postId, value },
      update: { value },
    });
  }

  const after = await prisma.forumPost.findUniqueOrThrow({
    where: { id: postId },
    select: { score: true },
  });
  return after.score;
}

export async function voteComment(
  userId: number,
  commentId: number,
  value: number,
): Promise<number> {
  const comment = await prisma.forumComment.findUnique({
    where: { id: commentId },
    select: { id: true },
  });
  if (!comment) throw notFound('Comentariul nu există');

  if (value === 0) {
    await prisma.commentVote.deleteMany({ where: { userId, commentId } });
  } else {
    await prisma.commentVote.upsert({
      where: { userId_commentId: { userId, commentId } },
      create: { userId, commentId, value },
      update: { value },
    });
  }

  const after = await prisma.forumComment.findUniqueOrThrow({
    where: { id: commentId },
    select: { score: true },
  });
  return after.score;
}

function toPostDto(row: PostRow, myVote: number): ForumPostDto {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    title: row.title,
    content: row.isDeleted ? null : row.content,
    author: row.isDeleted ? null : toAuthor(row.author),
    subject: row.subject,
    score: row.score,
    commentCount: row.commentCount,
    myVote,
    isDeleted: row.isDeleted,
    createdAt: row.createdAt.toISOString(),
  };
}
