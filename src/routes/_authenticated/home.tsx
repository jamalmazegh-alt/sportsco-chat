import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, MapPin, ChevronRight, Plus, Users } from "lucide-react";
import { format, isToday, isTomorrow } from "date-fns";
import { Button } from "@/components/ui/button";
import { AttendancePill } from "@/components/attendance-pill";
import { EventFormSheet } from "@/components/event-form-sheet";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
  head: () => ({ meta: [{ title: "Home — Squadly" }] }),
});

function formatWhen(d: Date, locale?: string) {
  const t = isToday(d) ? "Today" : isTomorrow(d) ? "Tomorrow" : format(d, "EEE d MMM");
  return `${t} · ${format(d, "HH:mm")}`;
  void locale;
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
        .order("name");
      return data ?? [];
    },
  });

  // Next event (any team in club user can see)
  const { data: upcoming } = useQuery({
    queryKey: ["upcoming", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      if (!teams || teams.length === 0) return [];
      const teamIds = teams.map((t) => t.id);
      const { data, error } = await supabase
        .from("events")
        .select("id, title, starts_at, location, type, status, team_id")
        .in("team_id", teamIds)
        .eq("status", "published")
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

  // My pending convocations (as player or parent)
  const { data: myConvocs } = useQuery({
    queryKey: ["my-convocations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // playerIds = own player record + linked children
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
      if (players.length === 0) return [];
      const playerIds = players.map((p) => p.id);
      const { data } = await supabase
        .from("convocations")
        .select("id, status, player_id, event:event_id(id, title, starts_at, status)")
        .in("player_id", playerIds);
      return (data ?? [])
        .filter((c: any) => c.event?.status === "published")
        .filter((c: any) => new Date(c.event.starts_at) > new Date())
        .map((c: any) => ({
          ...c,
          player: players.find((p) => p.id === c.player_id),
        }))
        .sort((a: any, b: any) =>
          new Date(a.event.starts_at).getTime() - new Date(b.event.starts_at).getTime()
        )
        .slice(0, 5);
    },
  });

  const isCoach = role === "admin" || role === "coach";

  return (
    <div className="px-5 pt-8 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          {club?.name}
        </p>
        <h1 className="text-2xl font-semibold mt-1">
          {t("dashboard.greeting", { name: user?.user_metadata?.full_name?.split(" ")[0] ?? "" })}
        </h1>
      </header>

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

      {/* My convocations (parents/players priority) */}
      {myConvocs && myConvocs.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
            {t("dashboard.myConvocations")}
          </h2>
          <ul className="space-y-2">
            {myConvocs.map((c: any) => (
              <li key={c.id}>
                <Link
                  to="/events/$eventId"
                  params={{ eventId: c.event.id }}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 active:scale-[0.99] transition-transform"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.event.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatWhen(new Date(c.event.starts_at), i18n.language)}
                      {c.player ? ` · ${c.player.first_name}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <AttendancePill status={c.status} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Upcoming */}
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
                      {formatWhen(new Date(e.starts_at), i18n.language)}
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
    </div>
  );
}
