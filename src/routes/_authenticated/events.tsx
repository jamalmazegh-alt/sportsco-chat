import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Plus, ChevronRight } from "lucide-react";
import { EventFormSheet } from "@/components/event-form-sheet";

export const Route = createFileRoute("/_authenticated/events")({
  component: EventsPage,
  head: () => ({ meta: [{ title: "Events — Squadly" }] }),
});

function EventsPage() {
  const { t } = useTranslation();
  const { user, activeClubId } = useAuth();
  const role = useActiveRole();
  const isCoach = role === "admin" || role === "coach";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: teams } = useQuery({
    queryKey: ["teams", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name")
        .eq("club_id", activeClubId!)
        .order("name");
      return data ?? [];
    },
  });

  const { data: events, isLoading } = useQuery({
    queryKey: ["events", activeClubId],
    enabled: !!activeClubId && !!teams,
    queryFn: async () => {
      const teamIds = (teams ?? []).map((t) => t.id);
      if (teamIds.length === 0) return [];
      const { data } = await supabase
        .from("events")
        .select("id, title, starts_at, location, type, status, team_id, opponent, competition_type")
        .in("team_id", teamIds)
        .order("starts_at", { ascending: true });
      return (data ?? []).map((e) => ({
        ...e,
        team_name: teams!.find((t) => t.id === e.team_id)?.name ?? "",
      }));
    },
  });

  return (
    <div className="px-5 pt-8 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("events.title")}</h1>
        {isCoach && user && (
          <EventFormSheet
            open={open}
            onOpenChange={setOpen}
            mode="create"
            teams={teams ?? []}
            userId={user.id}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["events"] });
              qc.invalidateQueries({ queryKey: ["upcoming"] });
            }}
            trigger={
              <Button size="sm" className="h-9">
                <Plus className="h-4 w-4" />
                {t("events.create")}
              </Button>
            }
          />
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : !events || events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Calendar className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{t("events.noEvents")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                to="/events/$eventId"
                params={{ eventId: e.id }}
                className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 active:scale-[0.99] transition-transform"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      {t(`events.types.${e.type}`)}
                    </span>
                    <p className="font-medium truncate">{e.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(e.starts_at), "EEE d MMM · HH:mm")}
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
    </div>
  );
}
