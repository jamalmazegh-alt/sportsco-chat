import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Bell, BellRing, Calendar, ChevronRight, Loader2 } from "lucide-react";
import { fmt } from "@/lib/date-locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/follow-ups")({
  component: FollowUpsPage,
  head: () => ({ meta: [{ title: "À relancer — Clubero" }] }),
});

type Row = {
  convocation_id: string;
  player_id: string;
  player_name: string;
  jersey_number: number | null;
  event_id: string;
  event_title: string;
  event_starts_at: string;
  team_name: string;
};

function FollowUpsPage() {
  const { t } = useTranslation();
  const { user, activeClubId } = useAuth();
  const role = useActiveRole();
  const isCoach = role === "admin" || role === "coach";
  const qc = useQueryClient();
  const [bulkSending, setBulkSending] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const { data: rows, isLoading } = useQuery({
    queryKey: ["follow-ups", activeClubId],
    enabled: !!activeClubId && isCoach,
    queryFn: async (): Promise<Row[]> => {
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name")
        .eq("club_id", activeClubId!);
      const teamIds = (teams ?? []).map((t) => t.id);
      if (teamIds.length === 0) return [];
      const teamById = new Map((teams ?? []).map((t) => [t.id, t.name]));

      const { data: events } = await supabase
        .from("events")
        .select("id, title, starts_at, team_id")
        .in("team_id", teamIds)
        .eq("status", "published")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(50);
      const eventIds = (events ?? []).map((e) => e.id);
      if (eventIds.length === 0) return [];
      const eventById = new Map((events ?? []).map((e) => [e.id, e]));

      const { data: convocs } = await supabase
        .from("convocations")
        .select("id, player_id, event_id, players:player_id(first_name, last_name, jersey_number)")
        .in("event_id", eventIds)
        .eq("status", "pending");

      return (convocs ?? []).map((c: any) => {
        const ev = eventById.get(c.event_id)!;
        const p = c.players ?? {};
        return {
          convocation_id: c.id,
          player_id: c.player_id,
          player_name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—",
          jersey_number: p.jersey_number ?? null,
          event_id: c.event_id,
          event_title: ev.title,
          event_starts_at: ev.starts_at,
          team_name: teamById.get(ev.team_id) ?? "",
        } as Row;
      });
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { event_id: string; title: string; starts_at: string; team_name: string; items: Row[] }>();
    for (const r of rows ?? []) {
      if (!map.has(r.event_id)) {
        map.set(r.event_id, {
          event_id: r.event_id,
          title: r.event_title,
          starts_at: r.event_starts_at,
          team_name: r.team_name,
          items: [],
        });
      }
      map.get(r.event_id)!.items.push(r);
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );
  }, [rows]);

  async function remindOne(row: Row, opts?: { silent?: boolean }) {
    if (!user) return false;
    const { data: recent } = await supabase
      .from("reminders")
      .select("id, sent_at")
      .eq("convocation_id", row.convocation_id)
      .order("sent_at", { ascending: false })
      .limit(1);
    if (recent && recent[0] && Date.now() - new Date(recent[0].sent_at).getTime() < 30 * 60 * 1000) {
      if (!opts?.silent) toast.info(t("attendance.alreadyRemindedRecently"));
      return false;
    }
    const { data: parents } = await supabase
      .from("player_parents")
      .select("parent_user_id")
      .eq("player_id", row.player_id);
    const { data: playerRow } = await supabase
      .from("players")
      .select("user_id")
      .eq("id", row.player_id)
      .maybeSingle();
    const recipients = Array.from(
      new Set([
        ...(playerRow?.user_id ? [playerRow.user_id] : []),
        ...((parents ?? []).map((p) => p.parent_user_id).filter(Boolean) as string[]),
      ]),
    );
    await supabase.from("reminders").insert({
      convocation_id: row.convocation_id,
      channel: "in_app",
      sent_by: user.id,
    });
    if (recipients.length > 0) {
      await supabase.from("notifications").insert(
        recipients.map((uid) => ({
          user_id: uid,
          type: "reminder",
          title: row.event_title,
          body: t("attendance.respondPrompt"),
          link: `/events/${row.event_id}`,
        })),
      );
    }
    return true;
  }

  async function handleRemindOne(row: Row) {
    setBusyIds((s) => new Set(s).add(row.convocation_id));
    const ok = await remindOne(row);
    if (ok) toast.success(t("attendance.remindSent"));
    setBusyIds((s) => {
      const n = new Set(s);
      n.delete(row.convocation_id);
      return n;
    });
  }

  async function handleRemindAll() {
    if (!rows || rows.length === 0) return;
    setBulkSending(true);
    let sent = 0;
    for (const r of rows) {
      const ok = await remindOne(r, { silent: true });
      if (ok) sent += 1;
    }
    setBulkSending(false);
    if (sent > 0) toast.success(t("attendance.remindAllSent", { count: sent }));
    else toast.info(t("attendance.alreadyRemindedRecently"));
    qc.invalidateQueries({ queryKey: ["follow-ups"] });
  }

  if (!isCoach) {
    return (
      <div className="px-5 pt-8 pb-8">
        <p className="text-sm text-muted-foreground">{t("common.unauthorized", { defaultValue: "Accès réservé aux coachs." })}</p>
      </div>
    );
  }

  const total = rows?.length ?? 0;

  return (
    <div className="px-5 pt-8 pb-8 space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("followUps.title", { defaultValue: "À relancer" })}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("followUps.subtitle", {
              defaultValue: "Joueurs sans réponse sur les prochains événements.",
            })}
          </p>
        </div>
        {total > 0 && (
          <Button
            size="sm"
            onClick={handleRemindAll}
            disabled={bulkSending}
            className="shrink-0"
          >
            {bulkSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BellRing className="h-4 w-4" />
            )}
            {t("attendance.remindAll")}
          </Button>
        )}
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={<Calendar className="h-6 w-6" />}
          title={t("followUps.empty", { defaultValue: "Tout le monde a répondu 🎉" })}
          description={t("followUps.emptyHint", {
            defaultValue: "Aucun joueur en attente sur les prochaines convocations.",
          })}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <section key={g.event_id} className="space-y-2">
              <Link
                to="/events/$eventId"
                params={{ eventId: g.event_id }}
                className="flex items-center justify-between gap-2 group"
              >
                <div className="min-w-0">
                  <h2 className="font-semibold truncate group-hover:text-primary transition-colors">
                    {g.title}
                  </h2>
                  <p className="text-xs text-muted-foreground truncate">
                    {fmt(g.starts_at, "EEE d MMM · HH:mm")}
                    {g.team_name ? ` · ${g.team_name}` : ""}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
              </Link>
              <ul className="space-y-1.5">
                {g.items.map((row) => {
                  const busy = busyIds.has(row.convocation_id);
                  return (
                    <li
                      key={row.convocation_id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                    >
                      <div className={cn(
                        "h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0",
                      )}>
                        {row.jersey_number ?? row.player_name.slice(0, 1)}
                      </div>
                      <p className="flex-1 min-w-0 text-sm font-medium truncate">{row.player_name}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRemindOne(row)}
                        disabled={busy}
                        className="h-8 shrink-0"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Bell className="h-3.5 w-3.5" />
                        )}
                        {t("attendance.remind")}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
