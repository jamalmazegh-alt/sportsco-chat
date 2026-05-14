import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  ChevronLeft, MapPin, Calendar, Bell, Lock, Unlock, Loader2,
} from "lucide-react";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AttendancePill } from "@/components/attendance-pill";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AttendanceStatus = "present" | "absent" | "uncertain" | "pending";

export const Route = createFileRoute("/_authenticated/events/$eventId")({
  component: EventDetail,
});

function EventDetail() {
  const { eventId } = Route.useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = useActiveRole();
  const isCoach = role === "admin" || role === "coach";
  const qc = useQueryClient();

  const { data: event } = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, description, starts_at, ends_at, location, meeting_point, opponent, type, status, team_id, responses_locked")
        .eq("id", eventId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: convocations, refetch } = useQuery({
    queryKey: ["convocations", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("convocations")
        .select("id, status, comment, player_id, players:player_id(id, first_name, last_name, jersey_number, user_id)")
        .eq("event_id", eventId);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`convoc-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "convocations", filter: `event_id=eq.${eventId}` },
        () => {
          refetch();
          qc.invalidateQueries({ queryKey: ["my-convocations"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, refetch, qc]);

  // Find current user's convocations (own player + parent of)
  const myConvocs = useMemo(() => {
    if (!user || !convocations) return [];
    return convocations.filter((c: any) => c.players?.user_id === user.id);
  }, [convocations, user]);

  const { data: childrenLinks } = useQuery({
    queryKey: ["my-children", user?.id],
    enabled: !!user && !isCoach,
    queryFn: async () => {
      const { data } = await supabase
        .from("player_parents")
        .select("player_id")
        .eq("parent_user_id", user!.id);
      return (data ?? []).map((d) => d.player_id);
    },
  });

  const myChildConvocs = useMemo(() => {
    if (!convocations || !childrenLinks) return [];
    return convocations.filter((c: any) => childrenLinks.includes(c.player_id));
  }, [convocations, childrenLinks]);

  async function respond(convocationId: string, status: AttendanceStatus) {
    const { error } = await supabase
      .from("convocations")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", convocationId);
    if (error) toast.error(error.message);
    else refetch();
  }

  async function remind(convocationId: string) {
    if (!user) return;
    // dedupe: check last reminder within 30min
    const { data: recent } = await supabase
      .from("reminders")
      .select("id, sent_at")
      .eq("convocation_id", convocationId)
      .order("sent_at", { ascending: false })
      .limit(1);
    if (recent && recent[0] && Date.now() - new Date(recent[0].sent_at).getTime() < 30 * 60 * 1000) {
      toast.info(t("attendance.alreadyRemindedRecently"));
      return;
    }
    const c = convocations?.find((x: any) => x.id === convocationId) as any;
    const playerUserId = c?.players?.user_id;
    // Get parents
    const { data: parents } = await supabase
      .from("player_parents")
      .select("parent_user_id")
      .eq("player_id", c?.player_id);
    const recipients = Array.from(
      new Set([
        ...(playerUserId ? [playerUserId] : []),
        ...((parents ?? []).map((p) => p.parent_user_id)),
      ])
    );
    await supabase.from("reminders").insert({
      convocation_id: convocationId,
      channel: "in_app",
      sent_by: user.id,
    });
    if (recipients.length > 0 && event) {
      await supabase.from("notifications").insert(
        recipients.map((uid) => ({
          user_id: uid,
          type: "reminder",
          title: event.title,
          body: t("attendance.respondPrompt"),
          link: `/events/${event.id}`,
        }))
      );
    }
    toast.success(t("attendance.remindSent"));
  }

  async function remindAllPending() {
    if (!convocations) return;
    const pending = convocations.filter((c) => c.status === "pending");
    for (const c of pending) await remind(c.id);
  }

  async function toggleLock() {
    if (!event) return;
    await supabase
      .from("events")
      .update({ responses_locked: !event.responses_locked })
      .eq("id", event.id);
    qc.invalidateQueries({ queryKey: ["event", eventId] });
  }

  // Counts
  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, uncertain: 0, pending: 0 };
    (convocations ?? []).forEach((x) => {
      c[x.status as AttendanceStatus]++;
    });
    return c;
  }, [convocations]);

  if (!event) {
    return (
      <div className="flex justify-center pt-20">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const visibleMyConvocs = [...myConvocs, ...myChildConvocs];

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <Link to="/events" className="inline-flex items-center text-sm text-muted-foreground gap-1">
        <ChevronLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
          {t(`events.types.${event.type}`)}
        </span>
        <h1 className="text-xl font-semibold mt-2">{event.title}</h1>
        <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {format(new Date(event.starts_at), "EEEE d MMMM · HH:mm")}
          </p>
          {event.location && (
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4" /> {event.location}
            </p>
          )}
          {event.opponent && <p>vs {event.opponent}</p>}
          {event.description && <p className="pt-2 text-foreground">{event.description}</p>}
        </div>
      </div>

      {/* My response (player/parent) */}
      {visibleMyConvocs.length > 0 && (
        <section className="space-y-3">
          {visibleMyConvocs.map((c: any) => (
            <div key={c.id} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-medium mb-3">
                {t("attendance.respondPrompt")}{" "}
                <span className="text-muted-foreground font-normal">
                  · {c.players?.first_name} {c.players?.last_name}
                </span>
              </p>
              {event.responses_locked ? (
                <p className="text-xs text-muted-foreground">{t("attendance.responsesLocked")}</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {(["present", "uncertain", "absent"] as AttendanceStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => respond(c.id, s)}
                      className={cn(
                        "rounded-xl py-3 text-sm font-semibold transition-all active:scale-95",
                        c.status === s
                          ? s === "present"
                            ? "bg-present text-present-foreground"
                            : s === "absent"
                              ? "bg-absent text-absent-foreground"
                              : "bg-uncertain text-uncertain-foreground"
                          : "bg-muted text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {t(`attendance.${s}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Coach attendance board */}
      {isCoach && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("attendance.title")}
            </h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={remindAllPending}>
                <Bell className="h-3.5 w-3.5" /> {t("attendance.remindAll")}
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={toggleLock}>
                {event.responses_locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-3">
            <Stat label={t("attendance.present")} value={counts.present} cls="bg-present text-present-foreground" />
            <Stat label={t("attendance.uncertain")} value={counts.uncertain} cls="bg-uncertain text-uncertain-foreground" />
            <Stat label={t("attendance.absent")} value={counts.absent} cls="bg-absent text-absent-foreground" />
            <Stat label={t("attendance.pending")} value={counts.pending} cls="bg-pending text-pending-foreground" />
          </div>

          {convocations && convocations.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("players.noPlayers")}
            </div>
          ) : (
            <ul className="space-y-2">
              {(convocations ?? []).map((c: any) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {c.players?.first_name} {c.players?.last_name}
                      {c.players?.jersey_number ? (
                        <span className="text-muted-foreground font-normal"> · #{c.players.jersey_number}</span>
                      ) : null}
                    </p>
                    {c.comment && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic truncate">"{c.comment}"</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <AttendancePill status={c.status} />
                    {c.status === "pending" && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remind(c.id)}>
                        <Bell className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={cn("rounded-xl p-3 text-center", cls)}>
      <p className="text-xl font-bold leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-wider mt-1 opacity-90">{label}</p>
    </div>
  );
}
