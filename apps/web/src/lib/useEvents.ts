import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateEventBody, EventDto, PaginationMeta } from '@campushub/shared';
import { api } from './apiClient.js';

const KEY = ['events'];

export type EventFilters = { mine?: boolean; page: number };

export function useEvents(filters: EventFilters) {
  const params = new URLSearchParams({ page: String(filters.page) });
  if (filters.mine) params.set('mine', 'true');

  return useQuery({
    queryKey: [...KEY, params.toString()],
    queryFn: () => api<{ data: EventDto[]; meta: PaginationMeta }>(`/events?${params}`),
  });
}

export function useAttend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, attending }: { id: number; attending: boolean }) =>
      api<{ data: EventDto }>(`/events/${id}/attend`, {
        method: attending ? 'POST' : 'DELETE',
      }).then((r) => r.data),
    // the calendar reads the same events so it would stop agreeing with this screen
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: KEY }),
        qc.invalidateQueries({ queryKey: ['calendar'] }),
      ]),
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEventBody) =>
      api<{ data: EventDto }>('/events', { method: 'POST', body }).then((r) => r.data),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: KEY }),
        qc.invalidateQueries({ queryKey: ['calendar'] }),
      ]),
  });
}
