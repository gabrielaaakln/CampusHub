import { useMutation } from '@tanstack/react-query';
import type { CreateReportBody } from '@campushub/shared';
import { api } from './apiClient.js';

export function useReport() {
  return useMutation({
    mutationFn: (body: CreateReportBody) =>
      api<{ data: { id: number } }>('/reports', { method: 'POST', body }).then((r) => r.data),
  });
}

