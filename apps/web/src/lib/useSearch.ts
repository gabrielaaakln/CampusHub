import { useQuery } from '@tanstack/react-query';
import type { SearchCountsDto, SearchHitDto, SearchType } from '@campushub/shared';
import { api } from './apiClient.js';

export function useSearch(q: string, type?: SearchType) {
  const params = new URLSearchParams({ q, limit: '20' });
  if (type) params.set('type', type);

  return useQuery({
    queryKey: ['search', params.toString()],
    queryFn: () =>
      api<{ data: SearchHitDto[]; meta: { q: string; counts: SearchCountsDto } }>(
        `/search?${params}`,
      ),
    enabled: q.trim().length >= 2,
  });
}
