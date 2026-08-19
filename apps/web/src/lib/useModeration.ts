import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateReportBody,
  ReportDto,
  ReportListMeta,
  ReportStatus,
  ResolveReportBody,
} from '@campushub/shared';
import { api } from './apiClient.js';

const KEY = ['reports'];

export function useReports(status: ReportStatus, page: number) {
  return useQuery({
    queryKey: [...KEY, status, page],
    queryFn: () =>
      api<{ data: ReportDto[]; meta: ReportListMeta }>(
        `/moderation/reports?status=${status}&page=${page}`,
      ),
  });
}

export function useReport() {
  return useMutation({
    mutationFn: (body: CreateReportBody) =>
      api<{ data: { id: number } }>('/reports', { method: 'POST', body }).then((r) => r.data),
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ResolveReportBody & { id: number }) =>
      api<{ data: ReportDto }>(`/moderation/reports/${id}`, { method: 'PATCH', body }).then(
        (r) => r.data,
      ),
    // deleting the target changes the forum and the listings too
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: KEY }),
        qc.invalidateQueries({ queryKey: ['forum'] }),
        qc.invalidateQueries({ queryKey: ['listings'] }),
      ]),
  });
}
