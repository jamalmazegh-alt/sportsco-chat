import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, MapPin, ChevronRight, Plus, Users, BarChart3 } from "lucide-react";
import { isToday, isTomorrow } from "date-fns";
import { fmt } from "@/lib/date-locale";
import i18n from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AttendancePill } from "@/components/attendance-pill";
import { EventFormSheet } from "@/components/event-form-sheet";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { AdminKpis } from "@/components/admin-kpis";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
  head: () => ({ meta: [{ title: "Home — Clubero" }] }),
});

function formatWhen(d: Date) {
  const label = isToday(d)
    ? i18n.t("common.today")
    : isTomorrow(d)
      ? i18n.t("common.tomorrow")
      : fmt(d, "EEE d MMM");
  return `${label} · ${fmt(d, "HH:mm")}`;
}

function HomePage() {
  const { t, i18n } = useTranslation();
  const { user, activeClubId, memberships } = useAuth();
  const role = useActiveRole();
  const club = memberships.find((m) => m.club_id === activeClubId)?.club;
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: teams } = useQuery({
    queryKey: ["teams", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name, competitions")
        .eq("club_id", activeClubId!)
        .is("deleted_at", null)
        .order("name");
      return data ?? [];
    },
  });

  // Next event (any team in club user can see)
  const { data: upcoming } = useQuery({
    queryKey: ["upcoming", activeClubId],
    enabled: !!activeClubId && !!teams,
    queryFn: async () => {
      if (!teams || teams.length === 0) return [];
      const teamIds = teams.map((t) => t.id);
      const { data, error } = await supabase
        .from("events")
        .select("id, title, starts_at, location, type, status, team_id")
        .in("team_id", teamIds)
        .eq("status", "published")
        .is("deleted_at", null)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(5);
      if (error) throw error;
      return (data ?? []).map((e) => ({
        ...e,
        team_name: teams.find((t) => t.id === e.team_id)?.name ?? "",
      }));
    },
  });

  // My convocations only (player or parent)
  const { data: myConvocs } = useQuery({
    queryKey: ["my-convocs-home", user?.id, activeClubId],
    enabled: !!user && !!activeClubId,
    queryFn: async () => {
      const [{ data: own }, { data: children }] = await Promise.all([
        supabase.from("players").select("id, first_name, last_name").eq("user_id", user!.id),
        supabase
          .from("player_parents")
          .select("player_id, players:player_id(id, first_name, last_name)")
          .eq("parent_user_id", user!.id),
      ]);
      const players = [
        ...(own ?? []),
        ...((children ?? []).map((c: any) => c.players).filter(Boolean) as any[]),
      ];
      const playerIds = players.map((p) => p.id);
      if (playerIds.length === 0) return [];

      const { data } = await supabase
        .from("convocations")
        .select("id, status, player_id, event:event_id(id, title, starts_at, location, type, status, team_id)")
        .in("player_id", playerIds)
        .order("created_at", { ascending: false });

      const now = new Date();
      return (data ?? [])
        .filter((c: any) => c.event && c.event.status === "published" && new Date(c.event.starts_at) >= now)
        .map((c: any) => ({
          ...c.event,
          team_name: (teams ?? []).find((t) => t.id === c.event.team_id)?.name ?? "",
          convocation: { id: c.id, status: c.status },
          player: players.find((p) => p.id === c.player_id) ?? null,
        }))
        .sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    },
  });

  const isCoach = role === "admin" || role === "coach";

  return (
    <div className="px-5 pt-8 space-y-6">
      {/* Club hero — centered logo */}
      <header className="flex flex-col items-center text-center pt-2">
        {club?.logo_url ? (
          <img
            src={club.logo_url}
            alt={club.name}
            className="h-28 w-28 rounded-3xl object-cover border border-border shadow-sm"
          />
        ) : (
          <div className="h-28 w-28 rounded-3xl bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary border border-border">
            {club?.name?.[0] ?? "C"}
          </div>
        )}
        <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          {club?.name}
        </p>
        <h1 className="text-2xl font-semibold mt-1">
          {t("dashboard.greeting", { name: user?.user_metadata?.full_name?.split(" ")[0] ?? "" })}
        </h1>
      </header>

      {/* Onboarding checklist (admins) */}
      {isCoach && role === "admin" && activeClubId && (
        <OnboardingChecklist
          clubId={activeClubId}
          hasLogo={!!club?.logo_url}
          onCreateEvent={() => setCreateOpen(true)}
        />
      )}

      {/* KPIs strip (admins/coaches) */}
      {isCoach && activeClubId && <AdminKpis clubId={activeClubId} />}

      {/* Quick actions */}
      {isCoach && (
        <div className="flex gap-2">
          {user && (
            <EventFormSheet
              open={createOpen}
              onOpenChange={setCreateOpen}
              mode="create"
              teams={teams ?? []}
              userId={user.id}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["events"] });
                qc.invalidateQueries({ queryKey: ["upcoming"] });
              }}
              trigger={<Button className="flex-1 h-11"><Plus className="h-4 w-4" />{t("dashboard.createEvent")}</Button>}
            />
          )}
          <Button asChild variant="outline" className="flex-1 h-11">
            <Link to="/teams">
              <Users className="h-4 w-4" />
              {t("dashboard.viewTeams")}
            </Link>
          </Button>
        </div>
      )}

      {/* For players/parents: shortcut to own attendance stats */}
      {!isCoach && myConvocs && myConvocs.length > 0 && (() => {
        const seen = new Map<string, { id: string; first_name: string; last_name?: string }>();
        for (const e of myConvocs as any[]) {
          if (e.player && !seen.has(e.player.id)) seen.set(e.player.id, e.player);
        }
        const players = Array.from(seen.values());
        if (players.length === 0) return null;
        return (
          <section className="space-y-2">
            {players.map((p) => (
              <Link
                key={p.id}
                to="/players/$playerId"
                params={{ playerId: p.id }}
                className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <BarChart3 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {players.length > 1
                        ? `${t("dashboard.myStats")} · ${p.first_name}`
                        : t("dashboard.myStats")}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {t("dashboard.myStatsHint")}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </section>
        );
      })()}

      {/* For players/parents: unified list of upcoming events with action-required highlight on pending convocations */}
      {!isCoach && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t("dashboard.myConvocations")}
            </h2>
            <Link to="/events" className="text-xs text-primary font-medium">
              {t("dashboard.viewAll")}
            </Link>
          </div>
          {!myConvocs || myConvocs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <Calendar className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t("dashboard.noUpcoming")}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {myConvocs.map((e: any) => {
                const actionRequired = e.convocation?.status === "pending";
                return (
                  <li key={e.id}>
                    <Link
                      to="/events/$eventId"
                      params={{ eventId: e.id }}
                      className={cn(
                        "flex items-center justify-between rounded-2xl border p-4 active:scale-[0.99] transition-transform",
                        actionRequired
                          ? "border-pending/40 bg-pending/5 ring-1 ring-pending/30"
                          : "border-border bg-card",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{e.title}</p>
                          {actionRequired && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-pending text-pending-foreground shrink-0">
                              {t("dashboard.actionRequired", { defaultValue: "Action required" })}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <Calendar className="h-3 w-3" />
                          <span>{formatWhen(new Date(e.starts_at))}</span>
                          {e.player && <span>· {e.player.first_name}</span>}
                          {e.team_name && <span>· {e.team_name}</span>}
                          {e.location && (
                            <>
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{e.location}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {e.convocation && <AttendancePill status={e.convocation.status} />}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* For coaches/admins: upcoming events for all teams */}
      {isCoach && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t("dashboard.nextEvent")}
            </h2>
            <Link to="/events" className="text-xs text-primary font-medium">
              {t("dashboard.viewAll")}
            </Link>
          </div>
          {!upcoming || upcoming.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <Calendar className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t("dashboard.noUpcoming")}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <Link
                    to="/events/$eventId"
                    params={{ eventId: e.id }}
                    className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 active:scale-[0.99] transition-transform"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{e.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        {formatWhen(new Date(e.starts_at))}
                        {e.location && (
                          <>
                            <span>·</span>
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{e.location}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
