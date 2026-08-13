import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginBody, RegisterBody, SessionUser, UpdateProfileBody } from '@campushub/shared';
import { api, forgetCsrfToken } from './apiClient.js';

const ME_KEY = ['auth', 'me'];

export function useSession() {
  const { data, isPending } = useQuery({
    queryKey: ME_KEY,
    queryFn: () => api<{ data: SessionUser | null }>('/auth/me').then((r) => r.data),
    staleTime: 60_000,
  });
  return { user: data ?? null, isPending };
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginBody) =>
      api<{ data: SessionUser }>('/auth/login', { method: 'POST', body }).then((r) => r.data),
    onSuccess: (user) => {
      forgetCsrfToken();
      qc.setQueryData(ME_KEY, user);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterBody) =>
      api<{ data: SessionUser }>('/auth/register', { method: 'POST', body }).then((r) => r.data),
    onSuccess: (user) => {
      forgetCsrfToken();
      qc.setQueryData(ME_KEY, user);
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileBody) =>
      api<{ data: SessionUser }>('/auth/me', { method: 'PATCH', body }).then((r) => r.data),
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user);
      // the schedule and the calendar depend on the group that just changed
      void qc.invalidateQueries();
    },
  });
}

/** the account is anonymised not deleted the posts stay without an author */
export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/me', { method: 'DELETE' }),
    onSuccess: () => {
      forgetCsrfToken();
      qc.setQueryData(ME_KEY, null);
      void qc.invalidateQueries();
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      forgetCsrfToken();
      qc.setQueryData(ME_KEY, null);
      void qc.invalidateQueries();
    },
  });
}
