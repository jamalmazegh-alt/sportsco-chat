import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fmt } from "@/lib/date-locale";
import {
  ChevronLeft, MapPin, Calendar, Bell, Lock, Unlock, Loader2, Send, Clock, ExternalLink, Pencil, Home, Plane, X, Info,
} from "lucide-react";
import { ConvocationDetailDialog } from "@/components/convocation-detail-dialog";
import { EventChat } from "@/components/event-chat";
import { AttachmentList, type Attachment } from "@/components/attachments";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AttendancePill } from "@/components/attendance-pill";
import { EventFormSheet } from "@/components/event-form-sheet";
import { Textarea } from "@/components/ui/textarea";
import { MatchResultCard } from "@/components/match-result-card";
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
  const [sending, setSending] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [detailConvocId, setDetailConvocId] = useState<string | null>(null);
  const [respondTarget, setRespondTarget] = useState<{ id: string; status: AttendanceStatus } | null>(null);
  const [respondReason, setRespondReason] = useState("");
  const [respondSubmitting, setRespondSubmitting] = useState(false);

  const { data: event, refetch: refetchEvent } = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, description, starts_at, ends_at, convocation_time, location, location_url, meeting_point, opponent, competition_type, competition_name, type, status, team_id, responses_locked, convocations_sent, is_home, attachments")
        .eq("id", eventId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: teams } = useQuery({
    queryKey: ["teams-min", event?.team_id],
    enabled: !!event,
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("id, name, competitions, sport").eq("id", event!.team_id);
      return data ?? [];
    },
  });

  const { data: convocations, refetch } = useQuery({
    queryKey: ["convocations", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("convocations")
        .select("id, status, comment, player_id, players:player_id(id, first_name, last_name, jersey_number, photo_url, user_id, preferred_position)")
        .eq("event_id", eventId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: teamPlayers } = useQuery({
    queryKey: ["team-players", event?.team_id],
    enabled: !!event,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("player_id, players:player_id(id, first_name, last_name, jersey_number, photo_url, user_id, preferred_position)")
        .eq("team_id", event!.team_id)
        .eq("role", "player");
      if (error) throw error;
      return (data ?? []).filter((tp: any) => tp.players);
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
    // For "absent" or "uncertain" → ask for optional reason via dialog
    if (status === "absent" || status === "uncertain") {
      const existing = (convocations ?? []).find((c: any) => c.id === convocationId);
      setRespondReason((existing as any)?.comment ?? "");
      setRespondTarget({ id: convocationId, status });
      return;
    }
    await submitResponse(convocationId, status, null);
  }

  async function notifyCoachesOfResponse(
    convocationId: string,
    status: "absent" | "uncertain",
    reason: string | null
  ) {
    if (!event) return;
    const conv = (convocations ?? []).find((c: any) => c.id === convocationId) as any;
    const playerName = `${conv?.players?.first_name ?? ""} ${conv?.players?.last_name ?? ""}`.trim() || "Un joueur";

    // Find coaches/admins of this team
    const { data: coaches } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", event.team_id)
      .in("role", ["coach", "admin"]);
    const coachIds = Array.from(
      new Set((coaches ?? []).map((c: any) => c.user_id).filter(Boolean))
    );

    if (coachIds.length > 0) {
      // In-app notifications
      await supabase.from("notifications").insert(
        coachIds.map((uid) => ({
          user_id: uid,
          type: "convocation_response",
          title: `${playerName} : ${t(`attendance.${status}`)}`,
          body: reason ? `${event.title} — "${reason}"` : event.title,
          link: `/events/${event.id}`,
        }))
      );
    }

    // Email notifications via server function (looks up coach emails server-side)
    try {
      const { notifyCoachesEmail } = await import("@/lib/convocation-notify.functions");
      await notifyCoachesEmail({ data: { convocationId } });
    } catch {
      // best-effort, non-blocking
    }
  }

  async function submitResponse(
    convocationId: string,
    status: AttendanceStatus,
    reason: string | null
  ) {
    const { error } = await supabase
      .from("convocations")
      .update({
        status,
        comment: reason && reason.trim() ? reason.trim() : null,
        responded_at: new Date().toISOString(),
      })
      .eq("id", convocationId);
    if (error) {
      toast.error(error.message);
      return false;
    }
    refetch();
    if (status === "absent" || status === "uncertain") {
      // fire-and-forget
      notifyCoachesOfResponse(convocationId, status, reason && reason.trim() ? reason.trim() : null).catch(
        () => {}
      );
    }
    return true;
  }

  async function confirmRespond() {
    if (!respondTarget) return;
    setRespondSubmitting(true);
    const ok = await submitResponse(respondTarget.id, respondTarget.status, respondReason);
    setRespondSubmitting(false);
    if (ok) {
      toast.success(t("attendance.responseRecorded"));
      setRespondTarget(null);
      setRespondReason("");
    }
  }

  async function confirmCancelConvocation() {
    if (!cancelTargetId) return;
    const id = cancelTargetId;
    setCancelTargetId(null);
    const { error } = await supabase.from("convocations").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(t("attendance.convocationCancelled"));
      refetch();
    }
  }

  function openPicker() {
    if (!teamPlayers || teamPlayers.length === 0) {
      toast.error(t("players.noPlayers"));
      return;
    }
    const existing = new Set((convocations ?? []).map((c: any) => c.player_id));
    // pre-select players that don't already have a convocation
    const preselect = new Set(
      teamPlayers.map((tp: any) => tp.player_id).filter((pid: string) => !existing.has(pid))
    );
    setSelectedIds(preselect);
    setPickerOpen(true);
  }

  async function sendConvocations() {
    if (!event || !user) return;
    const existing = new Set((convocations ?? []).map((c: any) => c.player_id));
    const toInsert = Array.from(selectedIds).filter((pid) => !existing.has(pid));
    if (toInsert.length === 0) {
      toast.error(t("attendance.noPlayersSelected"));
      return;
    }
    setSending(true);
    const { error: convocationError } = await supabase.from("convocations").insert(
      toInsert.map((pid) => ({ event_id: event.id, player_id: pid }))
    );
    if (convocationError) {
      setSending(false);
      toast.error(convocationError.message);
      return;
    }
    // notify
    const { data: parents } = await supabase
      .from("player_parents")
      .select("parent_user_id")
      .in("player_id", toInsert);
    const playerUserIds = (teamPlayers ?? [])
      .filter((tp: any) => toInsert.includes(tp.player_id))
      .map((tp: any) => tp.players?.user_id)
      .filter(Boolean);
    const recipients = Array.from(
      new Set([
        ...(parents ?? []).map((p: any) => p.parent_user_id).filter(Boolean),
        ...playerUserIds,
      ])
    );
    if (recipients.length > 0) {
      const { error: notificationError } = await supabase.from("notifications").insert(
        recipients.map((uid) => ({
          user_id: uid,
          type: "convocation",
          title: event.title,
          body: t("attendance.respondPrompt"),
          link: `/events/${event.id}`,
        }))
      );
      if (notificationError) toast.error(notificationError.message);
    }
    if (!event.convocations_sent) {
      const { error: sentError } = await supabase.from("events").update({ convocations_sent: true }).eq("id", event.id);
      if (sentError) {
        setSending(false);
        toast.error(sentError.message);
        return;
      }
    }
    setSending(false);
    setPickerOpen(false);
    refetch();
    refetchEvent();
    toast.success(t("events.convocationsSent"));
  }

  async function remind(convocationId: string, opts?: { silent?: boolean }) {
    if (!user) return false;
    const { data: recent } = await supabase
      .from("reminders")
      .select("id, sent_at")
      .eq("convocation_id", convocationId)
      .order("sent_at", { ascending: false })
      .limit(1);
    if (recent && recent[0] && Date.now() - new Date(recent[0].sent_at).getTime() < 30 * 60 * 1000) {
      if (!opts?.silent) toast.info(t("attendance.alreadyRemindedRecently"));
      return false;
    }
    const c = convocations?.find((x: any) => x.id === convocationId) as any;
    const playerUserId = c?.players?.user_id;
    const { data: parents } = await supabase
      .from("player_parents")
      .select("parent_user_id")
      .eq("player_id", c?.player_id);
    const recipients = Array.from(
      new Set([
        ...(playerUserId ? [playerUserId] : []),
        ...((parents ?? []).map((p) => p.parent_user_id).filter(Boolean)),
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
    if (!opts?.silent) toast.success(t("attendance.remindSent"));
    return true;
  }

  async function remindAllPending() {
    if (!convocations) return;
    const pending = convocations.filter((c) => c.status === "pending");
    if (pending.length === 0) return;
    let sent = 0;
    for (const c of pending) {
      const ok = await remind(c.id, { silent: true });
      if (ok) sent += 1;
    }
    if (sent > 0) toast.success(t("attendance.remindAllSent", { count: sent }));
    else toast.info(t("attendance.alreadyRemindedRecently"));
  }

  async function toggleLock() {
    if (!event) return;
    await supabase
      .from("events")
      .update({ responses_locked: !event.responses_locked })
      .eq("id", event.id);
    qc.invalidateQueries({ queryKey: ["event", eventId] });
  }

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, uncertain: 0, pending: 0 };
    (convocations ?? []).forEach((x) => {
      c[x.status as AttendanceStatus]++;
    });
    return c;
  }, [convocations]);

  // Pending first, then uncertain, absent, present — keeps the "à relancer" rows at the top
  const sortedConvocations = useMemo(() => {
    const order: Record<string, number> = { pending: 0, uncertain: 1, absent: 2, present: 3 };
    return [...(convocations ?? [])].sort(
      (a: any, b: any) => (order[a.status] ?? 9) - (order[b.status] ?? 9),
    );
  }, [convocations]);

  if (!event) {
    return (
      <div className="flex justify-center pt-20">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const visibleMyConvocs = [...myConvocs, ...myChildConvocs];
  const hasPendingForMe =
    !event.responses_locked &&
    visibleMyConvocs.some((c: any) => c.status === "pending");

  return (
    <div className="px-5 pt-6 pb-24 md:pb-6 space-y-5">
      <Link to="/events" className="inline-flex items-center text-sm text-muted-foreground gap-1">
        <ChevronLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              {t(`events.types.${event.type}`)}
            </span>
            {event.type === "match" && event.competition_type && (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">
                {t(`events.competitionTypes.${event.competition_type}`)}
                {event.competition_name ? ` · ${event.competition_name}` : ""}
              </span>
            )}
            {event.type === "match" && event.is_home !== null && (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                {event.is_home ? <Home className="h-2.5 w-2.5" /> : <Plane className="h-2.5 w-2.5" />}
                {t(event.is_home ? "events.home" : "events.away")}
              </span>
            )}
          </div>
          {isCoach && teams && (
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
        <h1 className="text-xl font-semibold mt-2">
          {event.type === "match" && event.opponent ? `vs ${event.opponent}` : event.title}
        </h1>
        <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="capitalize">{fmt(event.starts_at, "EEEE d MMMM · HH:mm")}</span>
            {event.ends_at && ` → ${fmt(event.ends_at, "HH:mm")}`}
          </p>
          {event.convocation_time && (
            <p className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t("events.convocationTime")}: {fmt(event.convocation_time, "HH:mm")}
            </p>
          )}
          {event.location && (
            <div className="flex items-start gap-2 flex-wrap">
              <MapPin className="h-4 w-4 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p>{event.location}</p>
                <div className="mt-1 flex flex-wrap gap-3">
                  <a
                    href={
                      event.location_url ??
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-xs font-medium"
                  >
                    {t("events.openInMaps")} <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href={`https://www.waze.com/ul?q=${encodeURIComponent(event.location)}&navigate=yes`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-xs font-medium"
                  >
                    {t("events.openInWaze")} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          )}
          {event.type === "match" && event.is_home === false && event.meeting_point && (
            <p className="flex items-center gap-2">
              <Plane className="h-4 w-4" />
              {t("events.meetingPoint")}: {event.meeting_point}
            </p>
          )}
          {event.description && <p className="pt-2 text-foreground">{event.description}</p>}
          {(() => {
            const list = (event.attachments as unknown as Attachment[] | null) ?? [];
            return list.length > 0 ? (
              <div className="pt-3"><AttachmentList items={list} /></div>
            ) : null;
          })()}
        </div>
      </div>

      {isCoach && teams && (
        <EventFormSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          mode="edit"
          teams={teams}
          userId={user!.id}
          initial={event as any}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["event", eventId] });
            qc.invalidateQueries({ queryKey: ["events"] });
          }}
        />
      )}

      {/* Coach: send convocations */}
      {isCoach && !event.convocations_sent && (
        <Button onClick={openPicker} className="w-full h-11">
          <Send className="h-4 w-4" />
          {t("events.sendConvocations")}
        </Button>
      )}
      {isCoach && event.convocations_sent && (
        <div className="space-y-2">
          <p className="text-xs text-center text-muted-foreground">
            ✓ {t("events.convocationsSent")}
          </p>
          {teamPlayers && teamPlayers.length > (convocations?.length ?? 0) && (
            <Button onClick={openPicker} variant="outline" className="w-full h-10">
              <Send className="h-4 w-4" />
              {t("attendance.addMorePlayers")}
            </Button>
          )}
        </div>
      )}

      {/* Player picker dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("attendance.selectPlayers")}</DialogTitle>
            <DialogDescription>{t("attendance.selectPlayersHint")}</DialogDescription>
          </DialogHeader>
          {teamPlayers && (
            <>
              <div className="flex items-center justify-between border-b pb-2">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <Checkbox
                    checked={
                      selectedIds.size > 0 &&
                      teamPlayers.every((tp: any) =>
                        (convocations ?? []).some((c: any) => c.player_id === tp.player_id) ||
                          selectedIds.has(tp.player_id)
                      )
                    }
                    onCheckedChange={(v) => {
                      if (v) {
                        const all = new Set<string>(
                          teamPlayers
                            .map((tp: any) => tp.player_id)
                            .filter(
                              (pid: string) =>
                                !(convocations ?? []).some((c: any) => c.player_id === pid)
                            )
                        );
                        setSelectedIds(all);
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                  />
                  {t("attendance.selectAll")}
                </label>
                <span className="text-xs text-muted-foreground">{selectedIds.size}</span>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1">
                {teamPlayers.map((tp: any) => {
                  const p = tp.players;
                  const alreadyConvoked = (convocations ?? []).some(
                    (c: any) => c.player_id === tp.player_id
                  );
                  const checked = alreadyConvoked || selectedIds.has(tp.player_id);
                  return (
                    <label
                      key={tp.player_id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg p-2 cursor-pointer hover:bg-accent",
                        alreadyConvoked && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={alreadyConvoked}
                        onCheckedChange={(v) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(tp.player_id);
                            else next.delete(tp.player_id);
                            return next;
                          });
                        }}
                      />
                      <div className="h-8 w-8 rounded-full bg-muted overflow-hidden shrink-0">
                        {p?.photo_url ? (
                          <img src={p.photo_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                            {(p?.first_name?.[0] ?? "") + (p?.last_name?.[0] ?? "")}
                          </div>
                        )}
                      </div>
                      <span className="text-sm flex-1 truncate">
                        {p?.first_name} {p?.last_name}
                        {p?.jersey_number ? (
                          <span className="text-muted-foreground"> · #{p.jersey_number}</span>
                        ) : null}
                        {p?.preferred_position ? (
                          <span className="text-muted-foreground"> · {p.preferred_position}</span>
                        ) : null}
                      </span>
                      {alreadyConvoked && (
                        <span className="text-[10px] uppercase text-muted-foreground">✓</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={sendConvocations} disabled={sending || selectedIds.size === 0}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t("events.sendConvocations")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* My response (player/parent) */}
      {visibleMyConvocs.length > 0 && (
        <section id="my-response" className="space-y-3 scroll-mt-20">
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

      {/* Match result + scorers (matches only) */}
      {event.type === "match" && (
        <MatchResultCard
          eventId={event.id}
          teamId={event.team_id}
          teamName={teams?.[0]?.name ?? null}
          isHome={event.is_home}
          opponent={event.opponent}
          isCoach={isCoach}
          startsAt={event.starts_at}
          sport={teams?.[0]?.sport ?? null}
        />
      )}

      {/* Attendance board (visible to all team viewers once convocations are sent) */}
      {event.convocations_sent && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {isCoach ? t("attendance.title") : t("attendance.convokedPlayers")}
            </h2>
            {isCoach && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8" onClick={remindAllPending}>
                  <Bell className="h-3.5 w-3.5" /> {t("attendance.remindAll")}
                </Button>
                <Button size="sm" variant="outline" className="h-8" onClick={toggleLock}>
                  {event.responses_locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                </Button>
              </div>
            )}
          </div>

          {isCoach && (
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              <Stat label={t("attendance.present")} value={counts.present} cls="bg-present/15 text-present-foreground border-present/30" />
              <Stat label={t("attendance.uncertain")} value={counts.uncertain} cls="bg-uncertain/15 text-uncertain-foreground border-uncertain/30" />
              <Stat label={t("attendance.absent")} value={counts.absent} cls="bg-absent/10 text-absent border-absent/30" />
              <Stat label={t("attendance.pending")} value={counts.pending} cls="bg-pending/40 text-pending-foreground border-border" />
            </div>
          )}

          {isCoach && counts.pending > 0 && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-pending/40 bg-pending/10 px-3 py-2.5">
              <p className="text-xs font-medium text-pending-foreground">
                {t("attendance.pendingCount", { count: counts.pending })}
              </p>
              <Button size="sm" className="h-8" onClick={remindAllPending}>
                <Bell className="h-3.5 w-3.5" /> {t("attendance.remindAll")}
              </Button>
            </div>
          )}

          {convocations && convocations.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("attendance.noConvokedPlayers")}
            </div>
          ) : (
            <ul className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
              {sortedConvocations.map((c: any) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-muted overflow-hidden">
                      {c.players?.photo_url ? (
                        <img src={c.players.photo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-[11px] font-semibold text-muted-foreground">
                          {(c.players?.first_name?.[0] ?? "") + (c.players?.last_name?.[0] ?? "")}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate leading-tight">
                        {c.players?.first_name} {c.players?.last_name}
                        {c.players?.jersey_number ? (
                          <span className="text-muted-foreground font-normal"> · #{c.players.jersey_number}</span>
                        ) : null}
                      </p>
                      {c.comment && (isCoach || c.players?.user_id === user?.id) && (
                        <p className="text-[11px] text-muted-foreground italic truncate">"{c.comment}"</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <AttendancePill status={c.status} />
                    {isCoach && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={() => setDetailConvocId(c.id)}
                        title={t("attendance.details")}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {isCoach && c.status === "pending" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remind(c.id)}>
                        <Bell className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {isCoach && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setCancelTargetId(c.id)}
                        title={t("attendance.cancelConvocation")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ConvocationDetailDialog
        open={!!detailConvocId}
        onOpenChange={(o) => !o && setDetailConvocId(null)}
        convocation={(convocations ?? []).find((c: any) => c.id === detailConvocId) ?? null}
        eventConvocationsSentAt={null}
        isCoach={isCoach}
        currentUserId={user?.id ?? null}
        onRemind={(id) => {
          remind(id);
        }}
        onCancel={(id) => {
          setDetailConvocId(null);
          setCancelTargetId(id);
        }}
      />

      <AlertDialog open={!!cancelTargetId} onOpenChange={(o) => !o && setCancelTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("attendance.cancelConvocation")}</AlertDialogTitle>
            <AlertDialogDescription>{t("attendance.confirmCancelConvocation")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelConvocation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("attendance.cancelConvocation")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!respondTarget}
        onOpenChange={(o) => {
          if (!o) {
            setRespondTarget(null);
            setRespondReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {respondTarget ? t(`attendance.${respondTarget.status}`) : ""}
            </DialogTitle>
            <DialogDescription>
              {t("attendance.reasonOptional")}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={respondReason}
            onChange={(e) => setRespondReason(e.target.value)}
            placeholder={t("attendance.reasonPlaceholder")}
            rows={3}
            maxLength={500}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRespondTarget(null);
                setRespondReason("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={confirmRespond} disabled={respondSubmitting}>
              {respondSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("attendance.confirmResponse")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EventChat eventId={eventId} />

      {/* Sticky bottom "Répondre" CTA — mobile only, when at least one of the user's convocations is still pending */}
      {hasPendingForMe && (
        <div className="md:hidden fixed bottom-16 inset-x-0 z-30 px-4 pb-3 pointer-events-none">
          <a
            href="#my-response"
            className="pointer-events-auto block rounded-2xl bg-primary text-primary-foreground text-center font-semibold py-3.5 shadow-lg shadow-primary/30 active:scale-[0.98] transition-transform"
          >
            {t("dashboard.respondNow")}
          </a>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={cn("rounded-lg border p-2 text-center", cls)}>
      <p className="text-base font-bold leading-none">{value}</p>
      <p className="text-[9px] uppercase tracking-wider mt-1 opacity-90">{label}</p>
    </div>
  );
}
