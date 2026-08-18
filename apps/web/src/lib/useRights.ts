import { useQuery } from '@tanstack/react-query';
import type { RightsArticleDto, RightsListMeta } from '@campushub/shared';
import { api } from './apiClient.js';

export type RightsFilters = { q?: string; category?: string; page: number };

export function useRights(filters: RightsFilters) {
  const params = new URLSearchParams({ page: String(filters.page) });
  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);

  return useQuery({
    queryKey: ['rights', params.toString()],
    queryFn: () => api<{ data: RightsArticleDto[]; meta: RightsListMeta }>(`/rights?${params}`),
  });
}
