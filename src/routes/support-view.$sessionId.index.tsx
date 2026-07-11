import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getSupportViewContext } from "@/lib/support-view/data.functions";
import { getSupportViewEvents } from "@/lib/support-view/data.functions";
import { getSupportViewTeams } from "@/lib/support-view/data.functions";
import { getSupportViewPlayers } from "@/lib/support-view/data.functions";

const contextOpts = (sessionId: string) =>
  queryOptions({
    queryKey: ["support-view", sessionId, "context"],
    queryFn: () => getSupportViewContext({ data: { session_id: sessionId } }),
  });
const eventsOpts = (sessionId: string) =>
  queryOptions({
    queryKey: ["support-view", sessionId, "events"],
    queryFn: () => getSupportViewEvents({ data: { session_id: sessionId } }),
  });
const teamsOpts = (sessionId: string) =>
  queryOptions({
    queryKey: ["support-view", sessionId, "teams"],
    queryFn: () => getSupportViewTeams({ data: { session_id: sessionId } }),
  });
const playersOpts = (sessionId: string) =>
  queryOptions({
    queryKey: ["support-view", sessionId, "players"],
    queryFn: () => getSupportViewPlayers({ data: { session_id: sessionId } }),
  });

export const Route = createFileRoute("/support-view/$sessionId/")({
  loader: async ({ context, params }) => {
    // context.queryClient is the SESSION-SCOPED client (overridden by parent's
    // beforeLoad) — same instance as the React provider.
    await Promise.all([
      context.queryClient.ensureQueryData(contextOpts(params.sessionId)),
      context.queryClient.ensureQueryData(teamsOpts(params.sessionId)),
      context.queryClient.ensureQueryData(eventsOpts(params.sessionId)),
      context.queryClient.ensureQueryData(playersOpts(params.sessionId)),
    ]);
  },
  component: SupportViewDashboard,
});

function SupportViewDashboard() {
  const { sessionId } = Route.useParams();
  const ctx = useSuspenseQuery(contextOpts(sessionId)).data;
  const teams = useSuspenseQuery(teamsOpts(sessionId)).data;
  const events = useSuspenseQuery(eventsOpts(sessionId)).data;
  const players = useSuspenseQuery(playersOpts(sessionId)).data;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          {ctx.target.full_name ?? "User"}
          <span className="text-muted-foreground text-lg font-normal"> · {ctx.club.name}</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Read-only support view · persona {ctx.persona}
        </p>
        <p className="text-xs text-muted-foreground mt-1 italic">Reason: {ctx.reason}</p>
      </header>

      <section className="grid sm:grid-cols-3 gap-3">
        <Stat label="Teams" value={teams.teams.length} />
        <Stat label="Events (recent)" value={events.events.length} />
        <Stat label="Players" value={players.players.length} />
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Teams</h2>
        <ul className="rounded-lg border border-border divide-y divide-border bg-card">
          {teams.teams.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              No teams visible to this user.
            </li>
          )}
          {teams.teams.map((t) => (
            <li key={t.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
              <span className="font-medium">{t.name}</span>
              <span className="text-xs text-muted-foreground">
                {t.sport ?? "—"} · {t.age_group ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Recent events</h2>
        <ul className="rounded-lg border border-border divide-y divide-border bg-card">
          {events.events.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">No events visible.</li>
          )}
          {events.events.slice(0, 20).map((e) => (
            <li key={e.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
              <span className="truncate">{e.title}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(e.starts_at).toLocaleString()} · {e.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Players ({players.players.length})</h2>
        <ul className="rounded-lg border border-border divide-y divide-border bg-card">
          {players.players.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">No players visible.</li>
          )}
          {players.players.slice(0, 50).map((p) => (
            <li key={p.id} className="px-4 py-2.5 text-sm">
              {p.first_name} {p.last_name}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
