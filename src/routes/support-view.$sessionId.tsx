import { createFileRoute, Outlet, useNavigate, redirect } from "@tanstack/react-router";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ShieldAlert, LogOut, Loader2 } from "lucide-react";
import { getSupportViewSession, endSupportViewSession } from "@/lib/support-view/session.functions";
import { getSupportQueryClient, disposeSupportQueryClient } from "@/lib/support-view/query-client";
import { SupportViewProvider } from "@/lib/support-view/context";
import type { SupportViewSessionDTO } from "@/lib/support-view/schemas";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/support-view/$sessionId")({
  // Inject a SESSION-SCOPED, STABLE QueryClient into the router context so
  // both child loaders (ensureQueryData) AND the React provider share the
  // exact same instance. Without this, loaders would hit the superadmin's
  // global cache and leak simulated data.
  beforeLoad: ({ params }) => ({
    queryClient: getSupportQueryClient(params.sessionId),
  }),
  loader: async ({ params }) => {
    try {
      const session = await getSupportViewSession({ data: { session_id: params.sessionId } });
      return { session };
    } catch (err) {
      // If session invalid/expired/not-owned → back to support hub.
      if (err instanceof Response && (err.status === 404 || err.status === 403)) {
        throw redirect({ to: "/superadmin/support" });
      }
      throw err;
    }
  },
  component: SupportViewLayout,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <ShieldAlert className="h-8 w-8 mx-auto text-destructive" />
        <h1 className="text-lg font-semibold">Support session unavailable</h1>
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <Button asChild variant="outline">
          <a href="/superadmin/support">← Back to Support hub</a>
        </Button>
      </div>
    </div>
  ),
});

function SupportViewLayout() {
  const { session } = Route.useLoaderData();
  const { sessionId } = Route.useParams();
  const client = getSupportQueryClient(sessionId);

  return (
    <QueryClientProvider client={client}>
      <SupportViewProvider value={{ session, sessionId }}>
        <div className="min-h-screen bg-background text-foreground">
          <SupportViewBanner session={session} sessionId={sessionId} />
          <main className="pt-16">
            <Outlet />
          </main>
        </div>
      </SupportViewProvider>
    </QueryClientProvider>
  );
}

function SupportViewBanner({
  session,
  sessionId,
}: {
  session: SupportViewSessionDTO;
  sessionId: string;
}) {
  const navigate = useNavigate();
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(session.expires_at).getTime() - Date.now()),
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, new Date(session.expires_at).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [session.expires_at]);

  // Re-validate the session server-side every 60s. If it's expired or ended,
  // this returns a 404 → we bail out. Belt-and-braces on top of the timer.
  useQuery({
    queryKey: ["support-view", sessionId, "heartbeat"],
    queryFn: () => getSupportViewSession({ data: { session_id: sessionId } }),
    refetchInterval: 60_000,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const quit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await endSupportViewSession({ data: { session_id: sessionId } });
    } catch {
      /* ignore — we exit anyway */
    }
    disposeSupportQueryClient(sessionId);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/superadmin/support");
    }
    navigate({ to: "/superadmin/support", replace: true });
  };

  useEffect(() => {
    if (remaining <= 0) void quit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const mm = Math.floor(remaining / 60000).toString().padStart(2, "0");
  const ss = Math.floor((remaining % 60000) / 1000).toString().padStart(2, "0");

  return (
    <div className="fixed top-0 inset-x-0 z-50 border-b border-amber-500/40 bg-amber-500/95 text-black">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-2.5 gap-3">
        <div className="flex items-center gap-2.5 text-sm min-w-0">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <div className="min-w-0 truncate">
            <span className="font-semibold">Support view</span>
            <span className="mx-2">•</span>
            <span>
              as <b>{session.target_full_name ?? "user"}</b> · {session.club_name ?? "club"} ·{" "}
              <span className="uppercase text-xs">{session.persona}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-sm tabular-nums">
            {mm}:{ss}
          </span>
          <Button size="sm" variant="secondary" onClick={quit} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5 mr-1.5" />}
            End session
          </Button>
        </div>
      </div>
    </div>
  );
}
