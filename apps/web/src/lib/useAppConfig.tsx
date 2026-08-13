import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AppConfig, FeatureKey } from '@campushub/shared';
import { Spinner } from '../components/Spinner.js';
import { api } from './apiClient.js';

const ConfigContext = createContext<AppConfig | null>(null);

// read once at boot everything flag driven reads it from here
export function AppConfigProvider({ children }: { children: ReactNode }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['config'],
    queryFn: () => api<AppConfig>('/config'),
    staleTime: Infinity,
    retry: 1,
  });

  if (isPending) {
    return (
      <div className="boot-loading">
        <Spinner />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p className="boot error">
        Serverul nu răspunde. Verifică dacă API-ul rulează pe portul 3000.
      </p>
    );
  }

  return <ConfigContext.Provider value={data}>{children}</ConfigContext.Provider>;
}

export function useAppConfig(): AppConfig {
  const value = useContext(ConfigContext);
  if (!value) throw new Error('useAppConfig used outside AppConfigProvider');
  return value;
}

export function useFeature(key: FeatureKey): boolean {
  return useAppConfig().features[key];
}
