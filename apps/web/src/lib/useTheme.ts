import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'campushub-theme';
const listeners = new Set<() => void>();

function stored(): Theme | null {
  const value = localStorage.getItem(KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** call before the first render so the page never paints in the other theme */
export function applyStoredTheme(): void {
  const choice = stored();
  if (choice) document.documentElement.dataset.theme = choice;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', listener);
  };
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore<Theme>(
    subscribe,
    () => stored() ?? systemTheme(),
    () => 'light',
  );

  // toggles away from what is on screen not from what the system prefers
  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(KEY, next);
    document.documentElement.dataset.theme = next;
    for (const listener of listeners) listener();
  }, [theme]);

  return { theme, toggle };
}
