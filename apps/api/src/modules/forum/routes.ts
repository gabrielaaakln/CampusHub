import { Router } from 'express';
import {
  createCommentBody,
  createPostBody,
  idParam,
  postListQuery,
  voteBody,
} from '@campushub/shared';
import { config } from '../../config.js';
import { prisma } from '../../lib/db.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { voteLimiter, writeLimiter } from '../../middleware/rateLimit.js';
import { valid, validate } from '../../middleware/validate.js';
import {
  listCategories,
  listComments,
  listPosts,
  postById,
  voteComment,
  votePost,
} from './service.js';

export const forumRouter: Router = Router();

forumRouter.get('/forum/categories', async (_req, res) => {
  res.json({ data: await listCategories(config.facultyId) });
});

const listSchemas = { query: postListQuery };

forumRouter.get('/forum/posts', validate(listSchemas), async (req, res) => {
  const { query } = valid<typeof listSchemas>(req);
  res.json(await listPosts(config.facultyId, query, req.user?.id ?? null));
});

const createSchemas = { body: createPostBody };

forumRouter.post('/forum/posts', requireAuth, writeLimiter, validate(createSchemas), async (req, res) => {
  const { body } = valid<typeof createSchemas>(req);

  const category = await prisma.forumCategory.findFirst({
    where: { id: body.categoryId, facultyId: config.facultyId },
    select: { id: true },
  });
  if (!category) throw badRequest('Categoria nu există', { field: 'categoryId' });

  const created = await prisma.forumPost.create({
    data: {
      categoryId: category.id,
      authorId: req.user!.id,
      subjectId: body.subjectId ?? null,
      title: body.title,
      content: body.content ?? null,
    },
    select: { id: true },
  });

  res.status(201).json({ data: await postById(config.facultyId, created.id, req.user!.id) });
});

forumRouter.get('/forum/posts/:id', validate({ params: idParam }), async (req, res) => {
  const { params } = valid<{ params: typeof idParam }>(req);
  res.json({ data: await postById(config.facultyId, params.id, req.user?.id ?? null) });
});

forumRouter.delete('/forum/posts/:id', requireAuth, validate({ params: idParam }), async (req, res) => {
  const { params } = valid<{ params: typeof idParam }>(req);
  const post = await prisma.forumPost.findFirst({
    where: { id: params.id, category: { facultyId: config.facultyId } },
    select: { id: true, authorId: true },
  });
  if (!post) throw notFound('Postarea nu există');

  const user = req.user!;
  if (post.authorId !== user.id && user.role === 'student') throw forbidden();

  // logical delete the thread keeps its shape
  await prisma.forumPost.update({ where: { id: post.id }, data: { isDeleted: true } });
  res.status(204).end();
});

forumRouter.get('/forum/posts/:id/comments', validate({ params: idParam }), async (req, res) => {
  const { params } = valid<{ params: typeof idParam }>(req);
  await postById(config.facultyId, params.id, null);
  res.json({ data: await listComments(params.id, req.user?.id ?? null) });
});

const commentSchemas = { params: idParam, body: createCommentBody };

forumRouter.post(
  '/forum/posts/:id/comments',
  requireAuth,
  writeLimiter,
  validate(commentSchemas),
  async (req, res) => {
    const { params, body } = valid<typeof commentSchemas>(req);
    await postById(config.facultyId, params.id, null);

    // n0 is a flat list depth is here so n1 can nest without a migration
    let depth = 0;
    if (body.parentCommentId) {
      const parent = await prisma.forumComment.findFirst({
        where: { id: body.parentCommentId, postId: params.id },
        select: { depth: true },
      });
      if (!parent) throw badRequest('Comentariul părinte nu există', { field: 'parentCommentId' });
      depth = Math.min(parent.depth + 1, 5);
    }

    await prisma.forumComment.create({
      data: {
        postId: params.id,
        parentCommentId: body.parentCommentId ?? null,
        authorId: req.user!.id,
        content: body.content,
        depth,
      },
    });

    res.status(201).json({ data: await listComments(params.id, req.user!.id) });
  },
);

forumRouter.delete(
  '/forum/comments/:id',
  requireAuth,
  validate({ params: idParam }),
  async (req, res) => {
    const { params } = valid<{ params: typeof idParam }>(req);
    const comment = await prisma.forumComment.findFirst({
      where: { id: params.id, post: { category: { facultyId: config.facultyId } } },
      select: { id: true, authorId: true },
    });
    if (!comment) throw notFound('Comentariul nu există');

    const user = req.user!;
    if (comment.authorId !== user.id && user.role === 'student') throw forbidden();

    // the comment keeps its place so replies under it do not lose their parent
    await prisma.forumComment.update({ where: { id: comment.id }, data: { isDeleted: true } });
    res.status(204).end();
  },
);

const voteSchemas = { params: idParam, body: voteBody };

forumRouter.post('/forum/posts/:id/vote', requireAuth, voteLimiter, validate(voteSchemas), async (req, res) => {
  const { params, body } = valid<typeof voteSchemas>(req);
  const score = await votePost(req.user!.id, params.id, body.value);
  res.json({ data: { score, myVote: body.value } });
});

forumRouter.post(
  '/forum/comments/:id/vote',
  requireAuth,
  voteLimiter,
  validate(voteSchemas),
  async (req, res) => {
    const { params, body } = valid<typeof voteSchemas>(req);
    const score = await voteComment(req.user!.id, params.id, body.value);
    res.json({ data: { score, myVote: body.value } });
  },
);
