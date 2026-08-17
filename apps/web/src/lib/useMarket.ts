import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateListingBody,
  CreateRequestBody,
  ListingDto,
  ListingKind,
  ListingRequestDto,
  PaginationMeta,
  RequestStatus,
  UpdateListingBody,
} from '@campushub/shared';
import { api } from './apiClient.js';
import { useSession } from './useSession.js';

const KEY = ['listings'];

export type ListingFilters = { kind?: ListingKind; q?: string; mine?: boolean; page: number };

export function useListings(filters: ListingFilters) {
  const params = new URLSearchParams({ page: String(filters.page) });
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.q) params.set('q', filters.q);
  if (filters.mine) params.set('mine', 'true');

  return useQuery({
    queryKey: [...KEY, params.toString()],
    queryFn: () => api<{ data: ListingDto[]; meta: PaginationMeta }>(`/listings?${params}`),
  });
}

export function useListing(id: number) {
  return useQuery({
    queryKey: [...KEY, 'one', id],
    queryFn: () => api<{ data: ListingDto }>(`/listings/${id}`).then((r) => r.data),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useMyRequests() {
  const { user } = useSession();
  return useQuery({
    queryKey: [...KEY, 'requests'],
    queryFn: () =>
      api<{ data: { received: ListingRequestDto[]; sent: ListingRequestDto[] } }>(
        '/listings/requests',
      ).then((r) => r.data),
    enabled: Boolean(user),
  });
}

export function useCreateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateListingBody) =>
      api<{ data: ListingDto }>('/listings', { method: 'POST', body }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateListing(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateListingBody) =>
      api<{ data: ListingDto }>(`/listings/${id}`, { method: 'PATCH', body }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAskContact(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRequestBody) =>
      api<{ data: { id: number } }>(`/listings/${id}/requests`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAnswerRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: RequestStatus }) =>
      api<{ data: { id: number } }>(`/requests/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
