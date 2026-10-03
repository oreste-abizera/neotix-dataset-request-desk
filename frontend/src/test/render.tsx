import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import { SessionWatcher } from "@/app/providers";
import { ThemeProvider } from "@/app/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppRoutes from "./routes-under-test";

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

type Reply = { status?: number; json?: unknown };
type Handler = (call: Call) => Reply | Promise<Reply> | undefined;

/**
 * Stub fetch. Routes are "METHOD /api/path" (query string ignored unless the key contains `?`).
 * Any request without a handler fails the test, so an unexpected API call cannot go unnoticed.
 */
export function mockApi(routes: Record<string, Reply | Handler>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    const call: Call = { method, path: url.pathname + url.search, body };
    calls.push(call);
    const key =
      Object.keys(routes).find((k) => k === `${method} ${call.path}`) ??
      Object.keys(routes).find((k) => k === `${method} ${url.pathname}`);
    if (!key) throw new Error(`Unmocked request: ${method} ${call.path}`);
    const route = routes[key];
    const result = await (typeof route === "function" ? route(call) : route);
    const status = result?.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(result?.json ?? null), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export const ok = (json: unknown) => ({ status: 200, json });
export const fail = (status: number, code: string, message: string, details?: unknown) => ({
  status,
  json: { error: { code, message, details } },
});

export function renderApp(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[path]}>
            <SessionWatcher client={client} />
            <AppRoutes />
          </MemoryRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { ...utils, queryClient: client };
}
