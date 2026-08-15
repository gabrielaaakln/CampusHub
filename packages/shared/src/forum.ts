import { z } from 'zod';
import { paginationQuery } from './common.js';

export const postSort = z.enum(['new', 'top']);
export type PostSort = z.infer<typeof postSort>;

export const postListQuery = paginationQuery.extend({
  sort: postSort.default('new'),
  categoryId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().min(1).max(120).optional(),
});
export type PostListQuery = z.infer<typeof postListQuery>;

export const createPostBody = z.object({
  categoryId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive().nullish(),
  title: z.string().trim().min(5, 'Titlul are cel puțin 5 caractere').max(200),
  content: z.string().trim().max(10_000).optional(),
});
export type CreatePostBody = z.infer<typeof createPostBody>;

export const createCommentBody = z.object({
  content: z.string().trim().min(1, 'Scrie ceva').max(5_000),
  parentCommentId: z.coerce.number().int().positive().nullish(),
});
export type CreateCommentBody = z.infer<typeof createCommentBody>;

// 0 removes the vote instead of storing a third value
export const voteBody = z.object({ value: z.coerce.number().int().min(-1).max(1) });
export type VoteBody = z.infer<typeof voteBody>;

export type AuthorDto = { id: number; displayName: string; groupName: string | null } | null;

export type ForumCategoryDto = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  postCount: number;
};

export type ForumPostDto = {
  id: number;
  categoryId: number;
  categoryName: string;
  title: string;
  content: string | null;
  author: AuthorDto;
  subject: { id: number; name: string } | null;
  score: number;
  commentCount: number;
  myVote: number;
  isDeleted: boolean;
  createdAt: string;
};

export type ForumCommentDto = {
  id: number;
  postId: number;
  parentCommentId: number | null;
  /** 0 for a top level comment the tree stops at 5 */
  depth: number;
  content: string;
  author: AuthorDto;
  score: number;
  myVote: number;
  isDeleted: boolean;
  createdAt: string;
};
