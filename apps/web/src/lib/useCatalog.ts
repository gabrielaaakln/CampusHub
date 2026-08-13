import { useQuery } from '@tanstack/react-query';
import type { StudyGroupDto, SubjectDto } from '@campushub/shared';
import { api } from './apiClient.js';

// both lists change once a year so they are worth keeping for the whole session
export function useGroups() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: () => api<{ data: StudyGroupDto[] }>('/groups').then((r) => r.data),
    staleTime: Infinity,
  });
}

export function useSubjects() {
  return useQuery({
    queryKey: ['subjects'],
    queryFn: () => api<{ data: SubjectDto[] }>('/subjects').then((r) => r.data),
    staleTime: Infinity,
  });
}
