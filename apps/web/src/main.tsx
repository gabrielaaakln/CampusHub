import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { App } from './App.js';
import { AppConfigProvider } from './lib/useAppConfig.js';
import { applyStoredTheme } from './lib/useTheme.js';
// self hosted so the content security policy stays at self and no request leaves the origin
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

applyStoredTheme();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppConfigProvider>
          <App />
        </AppConfigProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
