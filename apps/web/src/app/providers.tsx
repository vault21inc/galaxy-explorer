import { ApiError } from '@ge/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/** App-wide providers. TanStack Query caches API data; zustand stores need no provider. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Content changes only when the owner edits it, so refetching on every window focus
          // would be wasted work.
          queries: { refetchOnWindowFocus: false, retry: shouldRetry },
        },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Network failures and server errors get this many more tries, with backoff (1 s, then 2 s). */
const MAX_RETRIES = 2;

/**
 * Retry what might work next time. A 4xx (not found, invalid, forbidden) gives the same answer
 * however often it's asked, so the page shows it at once.
 */
function shouldRetry(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}
