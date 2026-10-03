import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { BrowserRouter } from "react-router";
import { SESSION_EXPIRED_EVENT } from "@/api/client";
import { ApiError } from "@/api/errors";
import { resetSession } from "@/api/queries/auth";
import { ThemeProvider, useThemeContext } from "./theme";

export const EXPIRED_FLAG = "neotix.session-expired";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        // Retry transient failures once; never retry a definitive answer (401/403/404/422).
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
      },
    },
  });
}

/** One place that reacts to a dead session: forget everything and send the user to sign in. */
export function SessionWatcher({ client }: { client: QueryClient }) {
  useEffect(() => {
    const onExpired = () => {
      try {
        sessionStorage.setItem(EXPIRED_FLAG, "1");
      } catch {
        /* the notice is a nicety; not having it is fine */
      }
      resetSession(client, null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [client]);
  return null;
}

// Loaded after the first render: toasts only ever appear in response to something the user did.
const Toaster = lazy(() => import("@/components/ui/toaster"));

function ThemedToaster() {
  return (
    <Suspense fallback={null}>
      <Toaster theme={useThemeContext().resolved} />
    </Suspense>
  );
}

export function Providers({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <SessionWatcher client={queryClient} />
          {children}
          <ThemedToaster />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
