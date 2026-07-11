// Stable, session-scoped QueryClient so that the route context.queryClient
// used by loaders and the React <QueryClientProvider> used by components
// are the SAME instance. This keeps support-view cache isolated from the
// superadmin's global cache and prevents leaks across the boundary.
import { QueryClient } from "@tanstack/react-query";

const clients = new Map<string, QueryClient>();

export function getSupportQueryClient(sessionId: string): QueryClient {
  let c = clients.get(sessionId);
  if (!c) {
    c = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: false },
      },
    });
    clients.set(sessionId, c);
  }
  return c;
}

export function disposeSupportQueryClient(sessionId: string) {
  const c = clients.get(sessionId);
  if (c) {
    c.clear();
    c.unmount();
    clients.delete(sessionId);
  }
}
