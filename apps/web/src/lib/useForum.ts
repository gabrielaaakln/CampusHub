import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateCommentBody,
  CreatePostBody,
  ForumCategoryDto,
  ForumCommentDto,
  ForumPostDto,
  PaginationMeta,
  PostSort,
} from '@campushub/shared';
import { api } from './apiClient.js';

const KEY = ['forum'];

export type PostFilters = { sort: PostSort; categoryId?: number; page: number; q?: string };

export function useCategories() {
  return useQuery({
    queryKey: [...KEY, 'categories'],
    queryFn: () => api<{ data: ForumCategoryDto[] }>('/forum/categories').then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

export function usePosts(filters: PostFilters) {
  const params = new URLSearchParams({ sort: filters.sort, page: String(filters.page) });
  if (filters.categoryId) params.set('categoryId', String(filters.categoryId));
  if (filters.q) params.set('q', filters.q);

  return useQuery({
    queryKey: [...KEY, 'posts', params.toString()],
    queryFn: () => api<{ data: ForumPostDto[]; meta: PaginationMeta }>(`/forum/posts?${params}`),
  });
}

export function usePost(id: number) {
  return useQuery({
    queryKey: [...KEY, 'post', id],
    queryFn: () => api<{ data: ForumPostDto }>(`/forum/posts/${id}`).then((r) => r.data),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useComments(postId: number) {
  return useQuery({
    queryKey: [...KEY, 'comments', postId],
    queryFn: () =>
      api<{ data: ForumCommentDto[] }>(`/forum/posts/${postId}/comments`).then((r) => r.data),
    enabled: Number.isFinite(postId) && postId > 0,
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePostBody) =>
      api<{ data: ForumPostDto }>('/forum/posts', { method: 'POST', body }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCreateComment(postId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCommentBody) =>
      api<{ data: ForumCommentDto[] }>(`/forum/posts/${postId}/comments`, {
        method: 'POST',
        body,
      }).then((r) => r.data),
    onSuccess: (comments) => {
      qc.setQueryData([...KEY, 'comments', postId], comments);
      void qc.invalidateQueries({ queryKey: [...KEY, 'post', postId] });
    },
  });
}

/** logical delete the author or a moderator the server decides which */
export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/forum/posts/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/forum/comments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

type VoteTarget = 'posts' | 'comments';

export function useVote(target: VoteTarget) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: number; value: number }) =>
      api<{ data: { score: number; myVote: number } }>(`/forum/${target}/${id}/vote`, {
        method: 'POST',
        body: { value },
      }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
