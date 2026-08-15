import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationDto, PaginationMeta } from '@campushub/shared';
import { api } from './apiClient.js';
import { useSession } from './useSession.js';

const KEY = ['notifications'];

type Meta = PaginationMeta & { unread: number };
type Page = { data: NotificationDto[]; meta: Meta };

// n0 is polling one line of config instead of a server sent events channel
const POLL_MS = 60_000;

export function useNotifications(page = 1) {
  const { user } = useSession();
  return useQuery({
    queryKey: [...KEY, page],
    queryFn: () => api<Page>(`/notifications?page=${page}&limit=20`),
    enabled: Boolean(user),
    refetchInterval: POLL_MS,
  });
}

export function useUnreadCount(): number {
  const { data } = useNotifications(1);
  return data?.meta.unread ?? 0;
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ data: { marked: number } }>('/notifications/read-all', { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
