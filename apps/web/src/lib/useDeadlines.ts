import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDeadlineBody,
  DeadlineDto,
  PaginationMeta,
  UpdateDeadlineBody,
} from '@campushub/shared';
import { api } from './apiClient.js';
import { useSession } from './useSession.js';

const KEY = ['deadlines'];

export function useDeadlines(mine = false) {
  const { user } = useSession();
  const params = new URLSearchParams({ limit: '50' });
  if (mine) params.set('mine', 'true');

  return useQuery({
    queryKey: [...KEY, params.toString(), user?.groupId],
    queryFn: () => api<{ data: DeadlineDto[]; meta: PaginationMeta }>(`/deadlines?${params}`),
  });
}

// a new deadline shows up in the calendar so both caches have to forget what they knew
const touched = (qc: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: KEY }),
    qc.invalidateQueries({ queryKey: ['calendar'] }),
  ]);

export function useCreateDeadline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDeadlineBody) =>
      api<{ data: DeadlineDto }>('/deadlines', { method: 'POST', body }).then((r) => r.data),
    onSuccess: () => touched(qc),
  });
}

export function useUpdateDeadline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateDeadlineBody & { id: number }) =>
      api<{ data: DeadlineDto }>(`/deadlines/${id}`, { method: 'PATCH', body }).then((r) => r.data),
    onSuccess: () => touched(qc),
  });
}

export function useDeleteDeadline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/deadlines/${id}`, { method: 'DELETE' }),
    onSuccess: () => touched(qc),
  });
}
