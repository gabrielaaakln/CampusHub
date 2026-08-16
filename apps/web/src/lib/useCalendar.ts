import { useQuery } from '@tanstack/react-query';
import type { CalendarDto } from '@campushub/shared';
import { api } from './apiClient.js';
import { useSession } from './useSession.js';

/** toISOString would convert to utc and shift the day back for any positive offset */
export function isoDay(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function mondayOf(date: Date): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function useCalendar(from: Date, to: Date, refetchInterval?: number) {
  const { user } = useSession();
  const range = { from: isoDay(from), to: isoDay(to) };

  return useQuery({
    queryKey: ['calendar', range.from, range.to, user?.groupId, user?.subgroup],
    queryFn: () =>
      api<{ data: CalendarDto }>(`/me/calendar?from=${range.from}&to=${range.to}`).then(
        (r) => r.data,
      ),
    enabled: Boolean(user),
    ...(refetchInterval ? { refetchInterval } : {}),
  });
}
