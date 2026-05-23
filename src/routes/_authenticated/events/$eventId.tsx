import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { domToPng } from "modern-screenshot";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";

const emailLocale = (): "fr" | "en" => ((i18n.language ?? "en").toLowerCase().startsWith("fr") ? "fr" : "en");
import { fmt } from "@/lib/date-locale";
import {
  ChevronLeft, MapPin, Bell, Lock, Unlock, Loader2, Send, Clock, ExternalLink, Pencil, Home, Plane, X, Info, Download, Ban, CalendarClock, MessageCircle, ClipboardList, CheckCircle2, XCircle, HelpCircle, CircleDot, MoreVertical, UserPlus,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toCsv, downloadCsv } from "@/lib/csv";
import {
  buildConvocationMessage,
  buildCancellationMessage,
  buildRescheduleMessage,
  buildReminderMessage,
  normalizeGroupUrl,
} from "@/lib/whatsapp";
import { ConvocationDetailDialog } from "@/components/convocation-detail-dialog";
import { EventChat } from "@/components/event-chat";
import { AttachmentList, type Attachment } from "@/components/attachments";
import { PublishedLineupCard } from "@/components/lineup/published-lineup-card";
import { EventDetailSkeleton } from "@/components/skeletons";
import { useAuth, useActiveRole, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { sendTransactionalEmail } from "@/lib/email/send";
import { loadLineupForConvocationEmailFn } from "@/lib/lineup-email.functions";

type AttendanceStatus = "present" | "absent" | "uncertain" | "pending";

const ATTENDANCE_ACTIONS: Array<{
  status: AttendanceStatus;
  Icon: typeof CheckCircle2;
  className: string;
}> = [
  { status: "present", Icon: CheckCircle2, className: "text-present hover:bg-present/15 hover:text-present" },
  { status: "absent", Icon: XCircle, className: "text-absent hover:bg-absent/10 hover:text-absent" },
  { status: "uncertain", Icon: HelpCircle, className: "text-uncertain-foreground hover:bg-uncertain/20 hover:text-uncertain-foreground" },
  { status: "pending", Icon: CircleDot, className: "text-pending-foreground hover:bg-pending/40 hover:text-pending-foreground" },
];

const CONVOC_SNAPSHOT_FIELDS = [
  "title",
  "description",
  "starts_at",
  "ends_at",
  "convocation_time",
  "location",
  "meeting_point",
  "competition_name",
  "type",
] as const;

function buildConvocSnapshot(ev: any): Record<string, any> {
  const snap: Record<string, any> = {};
  for (const k of CONVOC_SNAPSHOT_FIELDS) snap[k] = ev?.[k] ?? null;
  return snap;
}

function formatSnapshotValue(field: string, value: any, t: (k: string) => string): string | undefined {
  if (value == null || value === "") return undefined;
  if (field === "starts_at" || field === "ends_at" || field === "convocation_time") {
    try {
      return fmt(value, "EEEE d MMMM 'à' HH'h'mm");
    } catch {
      return String(value);
    }
  }
  if (field === "type") {
    return t(`events.types.${value}`) || String(value);
  }
  return String(value);
}

function diffSnapshot(prev: Record<string, any> | null | undefined, current: any, t: (k: string) => string): Array<{ field: string; label: string; previous?: string; current?: string }> {
  if (!prev) return [];
  const labels: Record<string, string> = {
    title: t("events.fields.title" as any) || "Title",
    description: t("events.fields.description" as any) || "Description",
    starts_at: t("events.fields.starts_at" as any) || "Date / time",
    ends_at: t("events.fields.ends_at" as any) || "End",
    convocation_time: t("events.fields.convocation_time" as any) || "Meeting time",
    location: t("events.fields.location" as any) || "Location",
    meeting_point: t("events.fields.meeting_point" as any) || "Meeting point",
    competition_name: t("events.fields.competition_name" as any) || "Competition",
    type: t("events.fields.type" as any) || "Type",
  };
  const out: Array<{ field: string; label: string; previous?: string; current?: string }> = [];
  for (const k of CONVOC_SNAPSHOT_FIELDS) {
    const a = prev[k] ?? null;
    const b = current?.[k] ?? null;
    if ((a ?? "") !== (b ?? "")) {
      out.push({
        field: k,
        label: labels[k] ?? k,
        previous: formatSnapshotValue(k, a, t),
        current: formatSnapshotValue(k, b, t),
      });
    }
  }
  return out;
}

export const Route = createFileRoute("/_authenticated/events/$eventId")({
  validateSearch: (s: Record<string, unknown>) => ({
    send: s.send === 1 || s.send === "1" ? 1 : undefined,
    preselect: typeof s.preselect === "string" && s.preselect.length > 0 ? s.preselect : undefined,
    action: typeof s.action === "string" && s.action.length > 0 ? s.action : undefined,
  }),
  component: EventDetailRoute,
});

async function waitForShareAssets(node: HTMLElement) {
  const fontsReady = (document as Document & { fonts?: FontFaceSet }).fonts?.ready.catch(() => undefined);
  const imagesReady = Array.from(node.querySelectorAll("img")).map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
    });
  });
  await Promise.allSettled([fontsReady, ...imagesReady].filter(Boolean));
}

function dataUrlToBlob(dataUrl: string) {
  const [header, payload] = dataUrl.split(",");
  const mime = header?.match(/data:(.*?);/)?.[1] ?? "image/png";
  const binary = atob(payload ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function EventDetailRoute() {
  const { eventId } = Route.useParams();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname !== `/events/${eventId}`) return <Outlet />;
  return <EventDetail />;
}

function EventDetail() {
  const { eventId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = useActiveRole();
  const roles = useMyRoles();
  const isActiveCoach = roles.includes("admin") || roles.includes("coach") || roles.includes("assistant_coach");
  const qc = useQueryClient();
  const loadLineupForEmail = useServerFn(loadLineupForConvocationEmailFn);
  const [sending, setSending] = useState(false);
  const [sharingLineup, setSharingLineup] = useState(false);
  const lineupCardRef = useRef<HTMLDivElement | null>(null);

  async function shareLineupAsImage(messageText: string) {
    const node = lineupCardRef.current;
    if (!node) {
      toast.error("Compo non disponible");
      return;
    }
    setSharingLineup(true);
    try {
      await waitForShareAssets(node);
      const dataUrl = await domToPng(node, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const blob = dataUrlToBlob(dataUrl);
      const file = new File([blob], "composition.png", { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
        share?: (data: ShareData) => Promise<void>;
      };
      const nativeShare = typeof nav.share === "function" ? nav.share.bind(nav) : null;
      const sharePayload: ShareData = { files: [file], text: messageText, title: "Composition Clubero" };
      const canShareFull = typeof nav.canShare === "function" ? nav.canShare(sharePayload) : true;
      const canShareFileOnly = typeof nav.canShare === "function" ? nav.canShare({ files: [file] }) : true;
      const canNativeShare = !!nativeShare && (canShareFull || canShareFileOnly);

      if (nativeShare && canNativeShare) {
        if (!canShareFull) await navigator.clipboard?.writeText(messageText).catch(() => undefined);
        try {
          await nativeShare(canShareFull ? sharePayload : { files: [file], title: "Composition Clubero" });
        } catch (shareError: any) {
          if (shareError?.name === "AbortError") return;
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = "composition.png";
          document.body.appendChild(a);
          a.click();
          a.remove();
          await navigator.clipboard?.writeText(messageText).catch(() => undefined);
          window.open(`https://wa.me/?text=${encodeURIComponent(messageText)}`, "_blank", "noopener,noreferrer");
          toast.success(t("events.whatsappShare.imageDownloadedAttach", { defaultValue: "Image downloaded, message copied — attach the image in WhatsApp" }));
          return;
        }
        toast.success(t("events.whatsappShare.shareReady", { defaultValue: "Share ready — pick WhatsApp" }));
      } else {
        // Browser fallback: WhatsApp deep-links cannot auto-attach files.
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "composition.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        await navigator.clipboard?.writeText(messageText).catch(() => undefined);
        window.open(`https://wa.me/?text=${encodeURIComponent(messageText)}`, "_blank", "noopener,noreferrer");
        toast.success(t("events.whatsappShare.imageDownloadedAttach", { defaultValue: "Image downloaded, message copied — attach the image in WhatsApp" }));
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        toast.error(t("events.whatsappShare.shareImageFailed", { defaultValue: "Unable to share the image" }));
      }
    } finally {
      setSharingLineup(false);
    }
  }
  const [editOpen, setEditOpen] = useState(false);
  const [autoSendConsumed, setAutoSendConsumed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerStep, setPickerStep] = useState<"select" | "review">("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [detailConvocId, setDetailConvocId] = useState<string | null>(null);
  const [respondTarget, setRespondTarget] = useState<{ id: string; status: AttendanceStatus } | null>(null);
  const [respondReason, setRespondReason] = useState("");
  const [respondSubmitting, setRespondSubmitting] = useState(false);
  const [coachOverrideTarget, setCoachOverrideTarget] = useState<{ id: string; status: AttendanceStatus; playerName: string; currentStatus: AttendanceStatus } | null>(null);
  const [cancelEventOpen, setCancelEventOpen] = useState(false);
  const [cancelEventReason, setCancelEventReason] = useState("");
  const [cancelEventSubmitting, setCancelEventSubmitting] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleNewDate, setRescheduleNewDate] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [resendSubmitting, setResendSubmitting] = useState(false);

  const { data: event, refetch: refetchEvent } = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, description, starts_at, ends_at, convocation_time, location, location_url, meeting_point, opponent, competition_type, competition_name, type, status, team_id, responses_locked, convocations_sent, is_home, attachments, cancellation_reason, cancelled_at, convocation_sent_snapshot, convocation_last_sent_at")
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
      const { data } = await supabase
        .from("teams")
        .select("id, name, club_id, competitions, sport, whatsapp_group_url, communication_mode, clubs:club_id(name, convocation_channels)")
        .eq("id", event!.team_id);
      return data ?? [];
    },
  });

  const { data: canAccessFeedback } = useQuery({
    queryKey: ["event-feedback-access", event?.id, event?.team_id, user?.id],
    enabled: !!event?.team_id && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_team_coach", {
        _team_id: event!.team_id,
        _user_id: user!.id,
      });
      if (error) return false;
      return !!data;
    },
  });

  const isCoach = isActiveCoach || !!canAccessFeedback;

  const { data: convocations, refetch } = useQuery({
    queryKey: ["convocations", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("convocations")
        .select("id, status, comment, player_id, response_token, players:player_id(id, first_name, last_name, jersey_number, photo_url, user_id, preferred_position, email)")
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
      // Dedupe by player_id (a player may have multiple team_member rows e.g. player + coach)
      const seen = new Set<string>();
      return (data ?? []).filter((tp: any) => {
        if (!tp.players) return false;
        if (seen.has(tp.player_id)) return false;
        seen.add(tp.player_id);
        return true;
      });
    },
  });

  // Published lineup (for WhatsApp + UI). Coach always sees; players see via PublishedLineupCard RLS.
  const { data: lineupData } = useQuery({
    queryKey: ["event-lineup-wa", eventId],
    enabled: !!event,
    queryFn: async () => {
      const { data: l } = await supabase
        .from("event_lineups")
        .select("formation, slots, bench, captain_player_id, gk_player_id, published_at")
        .eq("event_id", eventId)
        .not("published_at", "is", null)
        .maybeSingle();
      if (!l) return null;
      const slots = (l.slots as any[]) ?? [];
      const benchIds = (l.bench as any[]) ?? [];
      const ids = new Set<string>();
      slots.forEach((s: any) => s.player_id && ids.add(s.player_id));
      benchIds.forEach((id: any) => id && ids.add(id));
      if (ids.size === 0) return { ...l, _starting: [], _bench: [] };
      const { data: players } = await supabase
        .from("players")
        .select("id, first_name, last_name, jersey_number")
        .in("id", Array.from(ids));
      const byId = new Map<string, any>((players ?? []).map((p: any) => [p.id, p]));
      const name = (p: any) => `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "—";
      const starting = slots
        .filter((s: any) => s.player_id)
        .sort((a: any, b: any) => a.y - b.y || a.x - b.x)
        .map((s: any) => {
          const p = byId.get(s.player_id);
          return {
            name: name(p),
            jersey: p?.jersey_number ?? null,
            role: s.role,
            isCaptain: l.captain_player_id === s.player_id,
            isGK: l.gk_player_id === s.player_id,
          };
        });
      const bench = benchIds.map((id: any) => {
        const p = byId.get(id);
        return { name: name(p), jersey: p?.jersey_number ?? null };
      });
      return { formation: l.formation, _starting: starting, _bench: bench };
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

  function coachChangeStatus(c: any, status: AttendanceStatus) {
    if (!c || c.status === status) return;
    if (c.status !== "pending" && c.responded_at) {
      const playerName = `${c.players?.first_name ?? ""} ${c.players?.last_name ?? ""}`.trim() || "ce joueur";
      setCoachOverrideTarget({ id: c.id, status, playerName, currentStatus: c.status });
      return;
    }
    submitResponse(c.id, status, null);
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
    const conv = (convocations ?? []).find((c: any) => c.id === id) as any;
    const playerId: string | undefined = conv?.player_id;
    const playerUserId: string | undefined = conv?.players?.user_id ?? undefined;
    const playerEmail: string | undefined = conv?.players?.email ?? undefined;
    const playerFirstName: string | undefined = conv?.players?.first_name ?? undefined;
    const playerLastName: string | undefined = conv?.players?.last_name ?? undefined;
    const playerName = [playerFirstName, playerLastName].filter(Boolean).join(" ") || undefined;
    const { error } = await supabase.from("convocations").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("attendance.convocationCancelled"));
    refetch();

    // Notify the player + parents that their call-up was cancelled
    try {
      const recipientIds = new Set<string>();
      if (playerUserId) recipientIds.add(playerUserId);
      let parentsRows: Array<{ parent_user_id: string | null; email: string | null; full_name: string | null }> = [];
      if (playerId) {
        const { data: parents } = await supabase
          .from("player_parents")
          .select("parent_user_id, email, full_name")
          .eq("player_id", playerId);
        parentsRows = (parents ?? []) as any;
        parentsRows.forEach((p) => {
          if (p.parent_user_id) recipientIds.add(p.parent_user_id);
        });
      }
      if (recipientIds.size > 0 && event) {
        await supabase.from("notifications").insert(
          Array.from(recipientIds).map((uid) => ({
            user_id: uid,
            type: "convocation_cancelled",
            title: `${t("attendance.convocationCancelled")} — ${event.title}`,
            body: fmt(event.starts_at, "EEEE d MMMM 'à' HH'h'mm"),
            link: `/events/${event.id}`,
          })),
        );
      }

      // Email notification (best-effort)
      if (event) {
        const { data: clubRow } = event.team_id
          ? await supabase
              .from("teams")
              .select("name, clubs:club_id(name, logo_url)")
              .eq("id", event.team_id)
              .maybeSingle()
          : { data: null };
        const teamName = (clubRow as any)?.name as string | undefined;
        const clubName = (clubRow as any)?.clubs?.name as string | undefined;
        const clubLogoUrl = (clubRow as any)?.clubs?.logo_url as string | undefined;
        const eventDateLabel = fmt(event.starts_at, "EEEE d MMMM 'à' HH'h'mm");

        const sendOne = (toEmail: string, recipientFirstName: string | undefined, idemSuffix: string) =>
          sendTransactionalEmail({
            templateName: "convocation-cancelled",
            recipientEmail: toEmail,
            fromName: `${clubName ?? "Clubero"} via Clubero`,
            idempotencyKey: `convoc-cancel-${id}-${idemSuffix}`,
            templateData: {
              recipientFirstName,
              playerName,
              eventTitle: event.title,
              eventDate: eventDateLabel,
              eventLocation: event.location ?? undefined,
              teamName,
              clubName,
              clubLogoUrl,
              locale: emailLocale(),
            },
          } as any).catch(() => undefined);

        const sends: Promise<unknown>[] = [];
        if (playerEmail) {
          sends.push(sendOne(playerEmail, playerFirstName, "player"));
        }
        for (const parent of parentsRows) {
          if (!parent.email) continue;
          const parentFirst = (parent.full_name ?? "").split(" ")[0] || undefined;
          sends.push(sendOne(parent.email, parentFirst, `parent-${parent.email}`));
        }
        await Promise.allSettled(sends);
      }
    } catch {
      // best-effort
    }
  }

  function openPicker(opts?: { preselectAll?: boolean; preselectIds?: string[] }) {
    if (!teamPlayers || teamPlayers.length === 0) {
      toast.error(t("players.noPlayers"));
      return;
    }
    const existing = new Set((convocations ?? []).map((c: any) => c.player_id));
    const teamPlayerIds = new Set(teamPlayers.map((tp: any) => tp.player_id));
    let preselect: Set<string>;
    if (opts?.preselectIds && opts.preselectIds.length > 0) {
      preselect = new Set(
        opts.preselectIds.filter((pid) => teamPlayerIds.has(pid) && !existing.has(pid)),
      );
    } else if (opts?.preselectAll) {
      preselect = new Set<string>(
        teamPlayers
          .map((tp: any) => tp.player_id)
          .filter((pid: string) => !existing.has(pid)),
      );
    } else {
      preselect = new Set<string>();
    }
    setSelectedIds(preselect);
    setPickerStep("select");
    setPickerOpen(true);
  }

  // Auto-open the convocation picker when arriving from event creation with ?send=1
  useEffect(() => {
    if (autoSendConsumed) return;
    if (search.send !== 1) return;
    if (!isCoach) return;
    if (!event || (event as any).convocations_sent) return;
    if (!teamPlayers) return;
    setAutoSendConsumed(true);
    const preselectIds = search.preselect
      ? search.preselect.split(",").filter(Boolean)
      : undefined;
    openPicker(preselectIds ? { preselectIds } : undefined);
    navigate({
      to: "/events/$eventId",
      params: { eventId },
      search: {} as any,
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.send, search.preselect, isCoach, event, teamPlayers, autoSendConsumed]);

  async function sendConvocations() {
    if (!event || !user) return;
    const existing = new Set((convocations ?? []).map((c: any) => c.player_id));
    const toInsert = Array.from(selectedIds).filter((pid) => !existing.has(pid));
    if (toInsert.length === 0) {
      toast.error(t("attendance.noPlayersSelected"));
      return;
    }
    const teamRow = teams?.[0] as any;
    const commMode = (teamRow?.communication_mode ?? "app") as "app" | "whatsapp" | "hybrid";
    const clubChannelsRaw = teamRow?.clubs?.convocation_channels;
    const clubChannels: string[] = Array.isArray(clubChannelsRaw) ? clubChannelsRaw : ["in_app", "email"];
    const useInApp = clubChannels.includes("in_app");
    // Team-level override: whatsapp mode disables email entirely
    const useEmail = clubChannels.includes("email") && commMode !== "whatsapp";
    const useWhatsApp = commMode === "whatsapp" || commMode === "hybrid";
    setSending(true);
    // Insert convocations and get back their tokens
    const { data: insertedConvs, error: convocationError } = await supabase
      .from("convocations")
      .insert(toInsert.map((pid) => ({ event_id: event.id, player_id: pid })))
      .select("id, player_id, response_token");
    if (convocationError) {
      setSending(false);
      toast.error(convocationError.message);
      return;
    }
    // notify in-app
    const { data: parents } = await supabase
      .from("player_parents")
      .select("parent_user_id, email, full_name, player_id")
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
    if (useInApp && recipients.length > 0) {
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

    // 1-tap email invitations to player + parents (best-effort, non-blocking)
    if (useEmail) try {
      const { data: playersInfo } = await supabase
        .from("players")
        .select("id, first_name, last_name, email")
        .in("id", toInsert);
      const { data: clubRow } = event.team_id
        ? await supabase
            .from("teams")
            .select("name, clubs:club_id(name, logo_url)")
            .eq("id", event.team_id)
            .maybeSingle()
        : { data: null };
      const teamName = (clubRow as any)?.name as string | undefined;
      const clubName = (clubRow as any)?.clubs?.name as string | undefined;
      const clubLogoUrl = (clubRow as any)?.clubs?.logo_url as string | undefined;
      const eventDateLabel = fmt(event.starts_at, "EEEE d MMMM 'à' HH'h'mm");
      const origin = typeof window !== "undefined" ? window.location.origin : "";

      // Coach (first admin/coach) for the team — best-effort
      let coachName: string | undefined;
      try {
        const { data: coachRows } = await supabase
          .from("team_members")
          .select("user_id, role")
          .eq("team_id", event.team_id)
          .in("role", ["coach", "admin"])
          .limit(1);
        const coachUserId = coachRows?.[0]?.user_id;
        if (coachUserId) {
          const { data: coachProfile } = await supabase
            .from("profiles")
            .select("full_name, first_name, last_name")
            .eq("id", coachUserId)
            .maybeSingle();
          coachName =
            (coachProfile as any)?.full_name ||
            [(coachProfile as any)?.first_name, (coachProfile as any)?.last_name]
              .filter(Boolean)
              .join(" ") ||
            undefined;
        }
      } catch {
        // ignore
      }

      // Full squad list (names of all newly convoked players)
      const squadList = toInsert
        .map((pid) => {
          const p = (playersInfo ?? []).find((pp: any) => pp.id === pid) as any;
          return p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "";
        })
        .filter(Boolean);

      // Composition (si publiée)
      const lineupEmail = await loadLineupForEmail({ data: { eventId: event.id } }).catch(() => undefined);


      const competitionLabel = (event as any).competition_name
        || ((event as any).competition_type
          ? t(`events.competitionTypes.${(event as any).competition_type}`)
          : undefined);

      const locationMapsUrl = event.location
        ? (event.location_url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`)
        : undefined;
      const meetingPointMapsUrl = (event as any).meeting_point
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((event as any).meeting_point)}`
        : undefined;

      const sendOne = async (
        token: string,
        toEmail: string,
        recipientFirstName: string | undefined,
        playerName: string,
        idemSuffix: string,
      ) =>
        sendTransactionalEmail({
          templateName: "convocation-invite",
          recipientEmail: toEmail,
          fromName: `${clubName ?? "Clubero"} via Clubero`,
          idempotencyKey: `convoc-invite-${event.id}-${idemSuffix}`,
          templateData: {
            recipientFirstName,
            playerName,
            eventTitle: event.title,
            eventType: event.type,
            eventDate: eventDateLabel,
            eventDescription: (event as any).description ?? undefined,
            convocationTime: (event as any).convocation_time
              ? fmt((event as any).convocation_time, "EEEE d MMMM 'à' HH'h'mm")
              : undefined,
            eventLocation: event.location ?? undefined,
            locationMapsUrl,
            meetingPoint: (event as any).meeting_point ?? undefined,
            meetingPointMapsUrl,
            competitionName: competitionLabel,
            coachName,
            squadList,
            teamName,
            clubName,
            clubLogoUrl,
            respondUrl: `${origin}/r/${token}`,
            lineup: lineupEmail,
            locale: emailLocale(),
          },
        });


      const sends: Promise<unknown>[] = [];
      for (const conv of insertedConvs ?? []) {
        const player = (playersInfo ?? []).find((p: any) => p.id === conv.player_id) as any;
        if (!player) continue;
        const playerName = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
        // Player email
        if (player.email) {
          sends.push(
            sendOne(conv.response_token!, player.email, player.first_name ?? undefined, playerName, `p-${conv.id}`).catch(() => undefined),
          );
        }
        // Parent emails
        for (const parent of (parents ?? []).filter((p: any) => p.player_id === conv.player_id)) {
          if (!parent.email) continue;
          const parentFirst = (parent.full_name ?? "").split(" ")[0] || undefined;
          sends.push(
            sendOne(conv.response_token!, parent.email, parentFirst, playerName, `parent-${parent.player_id}-${conv.id}`).catch(() => undefined),
          );
        }
      }
      await Promise.allSettled(sends);
    } catch {
      // best-effort: in-app notif already sent
    }

    // Save snapshot of values just sent so we can diff later for "resend with changes"
    const snapshot = buildConvocSnapshot(event);
    if (!event.convocations_sent) {
      const { error: sentError } = await supabase
        .from("events")
        .update({ convocations_sent: true, convocation_sent_snapshot: snapshot, convocation_last_sent_at: new Date().toISOString() })
        .eq("id", event.id);
      if (sentError) {
        setSending(false);
        toast.error(sentError.message);
        return;
      }
    } else {
      await supabase
        .from("events")
        .update({ convocation_sent_snapshot: snapshot, convocation_last_sent_at: new Date().toISOString() })
        .eq("id", event.id);
    }

    // WhatsApp convocation: the coach shares via the WhatsApp card below
    // (browsers block window.open after async awaits, so we don't auto-open).

    setSending(false);
    setPickerOpen(false);
    refetch();
    refetchEvent();

    // Fire-and-forget: refresh pending_convocations insights for this club.
    // Limited to one insight type to keep AI costs minimal.
    const clubIdForInsights = (teamRow as any)?.club_id as string | undefined;
    if (clubIdForInsights) {
      import("@/lib/insights.functions")
        .then(({ triggerInsightsDetection }) =>
          triggerInsightsDetection({
            data: { clubId: clubIdForInsights, types: ["pending_convocations"] },
          }),
        )
        .catch(() => {
          // best-effort; never block the convocation flow
        });
    }

    toast.success(
      useWhatsApp
        ? t("events.whatsappShare.convocationsCreated", { defaultValue: "Call-ups created — share now via WhatsApp below" })
        : t("events.convocationsSent")
    );
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

  // Auto-trigger reminder flow from coach insights deep-link (?action=remind)
  const autoRemindTriggered = useRef(false);
  useEffect(() => {
    if (
      search.action === "remind" &&
      !autoRemindTriggered.current &&
      convocations &&
      isActiveCoach
    ) {
      autoRemindTriggered.current = true;
      remindAllPending();
      navigate({
        to: "/events/$eventId",
        params: { eventId },
        search: (prev: any) => ({ ...prev, action: undefined }),
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.action, convocations, isActiveCoach]);

  async function toggleLock() {
    if (!event) return;
    await supabase
      .from("events")
      .update({ responses_locked: !event.responses_locked })
      .eq("id", event.id);
    qc.invalidateQueries({ queryKey: ["event", eventId] });
  }

  async function confirmCancelEvent() {
    if (!event) return;
    const reason = cancelEventReason.trim();
    if (!reason) {
      toast.error(t("events.cancelEventReasonRequired"));
      return;
    }
    setCancelEventSubmitting(true);
    const { error } = await supabase
      .from("events")
      .update({
        status: "cancelled",
        cancellation_reason: reason,
        cancelled_at: new Date().toISOString(),
        responses_locked: true,
      })
      .eq("id", event.id);
    if (error) {
      setCancelEventSubmitting(false);
      toast.error(error.message);
      return;
    }

    // Notify all convoked players + their parents (in-app + email) and post on the wall
    try {
      const playerIds = (convocations ?? []).map((c: any) => c.player_id);
      const playerUserIds = (convocations ?? [])
        .map((c: any) => c.players?.user_id)
        .filter(Boolean);
      let parents: Array<{ parent_user_id: string | null; email: string | null; full_name: string | null; player_id: string }> = [];
      if (playerIds.length > 0) {
        const { data: parentsData } = await supabase
          .from("player_parents")
          .select("parent_user_id, email, full_name, player_id")
          .in("player_id", playerIds);
        parents = (parentsData ?? []) as any;
      }
      const parentIds = parents.map((p) => p.parent_user_id).filter(Boolean) as string[];
      const recipients = Array.from(new Set([...playerUserIds, ...parentIds]));
      if (recipients.length > 0) {
        await supabase.from("notifications").insert(
          recipients.map((uid) => ({
            user_id: uid,
            type: "event_cancelled",
            title: `${t("events.eventCancelled")} — ${event.title}`,
            body: reason,
            link: `/events/${event.id}`,
          })),
        );
      }

      // Club + team info for email branding & wall post
      const { data: teamRow } = await supabase
        .from("teams")
        .select("name, club_id, clubs:club_id(name, logo_url)")
        .eq("id", event.team_id)
        .maybeSingle();
      const teamName = (teamRow as any)?.name as string | undefined;
      const clubId = (teamRow as any)?.club_id as string | undefined;
      const clubName = (teamRow as any)?.clubs?.name as string | undefined;
      const clubLogoUrl = (teamRow as any)?.clubs?.logo_url as string | undefined;
      const eventDateLabel = fmt(event.starts_at, "EEEE d MMMM 'à' HH'h'mm");

      // Player emails
      const { data: playersInfo } = playerIds.length > 0
        ? await supabase
            .from("players")
            .select("id, first_name, last_name, email")
            .in("id", playerIds)
        : { data: [] as any[] };

      const sendOne = (
        toEmail: string,
        recipientFirstName: string | undefined,
        playerName: string | undefined,
        idemSuffix: string,
      ) =>
        sendTransactionalEmail({
          templateName: "event-cancelled",
          recipientEmail: toEmail,
          fromName: `${clubName ?? "Clubero"} via Clubero`,
          idempotencyKey: `event-cancelled-${event.id}-${idemSuffix}`,
          templateData: {
            recipientFirstName,
            playerName,
            eventTitle: event.title,
            eventDate: eventDateLabel,
            eventLocation: event.location ?? undefined,
            reason,
            teamName,
            clubName,
            clubLogoUrl,
            locale: emailLocale(),
          },
        }).catch(() => undefined);

      const sends: Promise<unknown>[] = [];
      for (const c of (convocations ?? []) as any[]) {
        const player = (playersInfo ?? []).find((p: any) => p.id === c.player_id) as any;
        const playerName = player
          ? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()
          : undefined;
        if (player?.email) {
          sends.push(sendOne(player.email, player.first_name ?? undefined, playerName, `p-${c.id}`));
        }
        for (const parent of parents.filter((p) => p.player_id === c.player_id)) {
          if (!parent.email) continue;
          const parentFirst = (parent.full_name ?? "").split(" ")[0] || undefined;
          sends.push(sendOne(parent.email, parentFirst, playerName, `parent-${parent.player_id}-${c.id}`));
        }
      }
      await Promise.allSettled(sends);

      // Post on the club wall (best-effort)
      if (clubId && user) {
        const wallBody = `❌ ${t("events.eventCancelled")} — ${event.title}${teamName ? ` (${teamName})` : ""}\n📅 ${eventDateLabel}\n\n${t("events.cancellationReason")} : ${reason}`;
        await supabase.from("wall_posts").insert({
          club_id: clubId,
          author_user_id: user.id,
          body: wallBody,
        });
      }
    } catch {
      // best-effort
    }

    setCancelEventSubmitting(false);
    setCancelEventOpen(false);
    setCancelEventReason("");
    toast.success(t("events.cancelEventSuccess"));
    qc.invalidateQueries({ queryKey: ["event", eventId] });
    qc.invalidateQueries({ queryKey: ["events"] });
  }

  function openReschedule() {
    if (!event) return;
    const d = new Date(event.starts_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setRescheduleNewDate(local);
    setRescheduleReason("");
    setRescheduleOpen(true);
  }

  async function confirmReschedule() {
    if (!event) return;
    if (!rescheduleNewDate) {
      toast.error(t("events.rescheduleInvalidDate"));
      return;
    }
    const newDate = new Date(rescheduleNewDate);
    if (isNaN(newDate.getTime())) {
      toast.error(t("events.rescheduleInvalidDate"));
      return;
    }
    const previousStart = new Date(event.starts_at);
    if (newDate.getTime() === previousStart.getTime()) {
      toast.error(t("events.rescheduleSameDate"));
      return;
    }
    setRescheduleSubmitting(true);

    const updates: { starts_at: string; ends_at?: string; convocation_time?: string } = { starts_at: newDate.toISOString() };
    if (event.ends_at) {
      const offsetMs = new Date(event.ends_at).getTime() - previousStart.getTime();
      updates.ends_at = new Date(newDate.getTime() + offsetMs).toISOString();
    }
    if (event.convocation_time) {
      const deltaMs = newDate.getTime() - previousStart.getTime();
      updates.convocation_time = new Date(new Date(event.convocation_time).getTime() + deltaMs).toISOString();
    }

    const { error } = await supabase.from("events").update(updates).eq("id", event.id);
    if (error) {
      setRescheduleSubmitting(false);
      toast.error(error.message);
      return;
    }

    const reason = rescheduleReason.trim();
    const previousDateLabel = fmt(previousStart.toISOString(), "EEEE d MMMM 'à' HH'h'mm");
    const newDateLabel = fmt(newDate.toISOString(), "EEEE d MMMM 'à' HH'h'mm");

    try {
      const playerIds = (convocations ?? []).map((c: any) => c.player_id);
      const playerUserIds = (convocations ?? [])
        .map((c: any) => c.players?.user_id)
        .filter(Boolean);
      let parents: Array<{ parent_user_id: string | null; email: string | null; full_name: string | null; player_id: string }> = [];
      if (playerIds.length > 0) {
        const { data: parentsData } = await supabase
          .from("player_parents")
          .select("parent_user_id, email, full_name, player_id")
          .in("player_id", playerIds);
        parents = (parentsData ?? []) as any;
      }
      const parentIds = parents.map((p) => p.parent_user_id).filter(Boolean) as string[];
      const recipients = Array.from(new Set([...playerUserIds, ...parentIds]));
      if (recipients.length > 0) {
        await supabase.from("notifications").insert(
          recipients.map((uid) => ({
            user_id: uid,
            type: "event_rescheduled",
            title: `${t("events.eventRescheduled")} — ${event.title}`,
            body: `${previousDateLabel} → ${newDateLabel}${reason ? `\n${reason}` : ""}`,
            link: `/events/${event.id}`,
          })),
        );
      }

      const { data: teamRow } = await supabase
        .from("teams")
        .select("name, club_id, clubs:club_id(name, logo_url)")
        .eq("id", event.team_id)
        .maybeSingle();
      const teamName = (teamRow as any)?.name as string | undefined;
      const clubId = (teamRow as any)?.club_id as string | undefined;
      const clubName = (teamRow as any)?.clubs?.name as string | undefined;
      const clubLogoUrl = (teamRow as any)?.clubs?.logo_url as string | undefined;

      const { data: playersInfo } = playerIds.length > 0
        ? await supabase
            .from("players")
            .select("id, first_name, last_name, email")
            .in("id", playerIds)
        : { data: [] as any[] };

      const idemBase = newDate.getTime();
      const sendOne = (
        toEmail: string,
        recipientFirstName: string | undefined,
        playerName: string | undefined,
        idemSuffix: string,
      ) =>
        sendTransactionalEmail({
          templateName: "event-rescheduled",
          recipientEmail: toEmail,
          fromName: `${clubName ?? "Clubero"} via Clubero`,
          idempotencyKey: `event-rescheduled-${event.id}-${idemBase}-${idemSuffix}`,
          templateData: {
            recipientFirstName,
            playerName,
            eventTitle: event.title,
            previousDate: previousDateLabel,
            newDate: newDateLabel,
            eventLocation: event.location ?? undefined,
            reason: reason || undefined,
            teamName,
            clubName,
            clubLogoUrl,
            locale: emailLocale(),
          },
        }).catch(() => undefined);

      const sends: Promise<unknown>[] = [];
      for (const c of (convocations ?? []) as any[]) {
        const player = (playersInfo ?? []).find((p: any) => p.id === c.player_id) as any;
        const playerName = player
          ? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()
          : undefined;
        if (player?.email) {
          sends.push(sendOne(player.email, player.first_name ?? undefined, playerName, `p-${c.id}`));
        }
        for (const parent of parents.filter((p) => p.player_id === c.player_id)) {
          if (!parent.email) continue;
          const parentFirst = (parent.full_name ?? "").split(" ")[0] || undefined;
          sends.push(sendOne(parent.email, parentFirst, playerName, `parent-${parent.player_id}-${c.id}`));
        }
      }
      await Promise.allSettled(sends);

      if (clubId && user) {
        const wallBody = `🔁 ${t("events.eventRescheduled")} — ${event.title}${teamName ? ` (${teamName})` : ""}\n${t("events.previousDate")} : ${previousDateLabel}\n${t("events.newDate")} : ${newDateLabel}${reason ? `\n\n${reason}` : ""}`;
        await supabase.from("wall_posts").insert({
          club_id: clubId,
          author_user_id: user.id,
          body: wallBody,
        });
      }
    } catch {
      // best-effort
    }

    setRescheduleSubmitting(false);
    setRescheduleOpen(false);
    setRescheduleReason("");
    toast.success(t("events.rescheduleSuccess"));
    qc.invalidateQueries({ queryKey: ["event", eventId] });
    qc.invalidateQueries({ queryKey: ["events"] });
  }

  async function resendConvocations() {
    if (!event || !user) return;
    if (!convocations || convocations.length === 0) {
      toast.error(t("events.resend.noConvocations", { defaultValue: "No call-up to resend" }));
      return;
    }
    const changes = diffSnapshot((event as any).convocation_sent_snapshot, event, t);
    setResendSubmitting(true);
    try {
      const playerIds = convocations.map((c: any) => c.player_id);
      const { data: parents } = await supabase
        .from("player_parents")
        .select("parent_user_id, email, full_name, player_id")
        .in("player_id", playerIds);

      const { data: clubRow } = await supabase
        .from("teams")
        .select("name, clubs:club_id(name, logo_url)")
        .eq("id", event.team_id)
        .maybeSingle();
      const teamName = (clubRow as any)?.name as string | undefined;
      const clubName = (clubRow as any)?.clubs?.name as string | undefined;
      const clubLogoUrl = (clubRow as any)?.clubs?.logo_url as string | undefined;
      const eventDateLabel = fmt(event.starts_at, "EEEE d MMMM 'à' HH'h'mm");
      const origin = typeof window !== "undefined" ? window.location.origin : "";

      const competitionLabel = (event as any).competition_name
        || ((event as any).competition_type
          ? t(`events.competitionTypes.${(event as any).competition_type}`)
          : undefined);
      const locationMapsUrl = event.location
        ? ((event as any).location_url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`)
        : undefined;
      const meetingPointMapsUrl = (event as any).meeting_point
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((event as any).meeting_point)}`
        : undefined;

      const squadList = (convocations as any[])
        .map((c) => `${c.players?.first_name ?? ""} ${c.players?.last_name ?? ""}`.trim())
        .filter(Boolean);

      const lineupEmail = await loadLineupForEmail({ data: { eventId: event.id } }).catch(() => undefined);

      const idemBase = Date.now();

      const sendOne = (token: string, toEmail: string, recipientFirstName: string | undefined, playerName: string, idemSuffix: string) =>
        sendTransactionalEmail({
          templateName: "convocation-invite",
          recipientEmail: toEmail,
          fromName: `${clubName ?? "Clubero"} via Clubero`,
          idempotencyKey: `convoc-update-${event.id}-${idemBase}-${idemSuffix}`,
          templateData: {
            recipientFirstName,
            playerName,
            eventTitle: event.title,
            eventType: event.type,
            eventDate: eventDateLabel,
            eventDescription: (event as any).description ?? undefined,
            convocationTime: (event as any).convocation_time
              ? fmt((event as any).convocation_time, "EEEE d MMMM 'à' HH'h'mm")
              : undefined,
            eventLocation: event.location ?? undefined,
            locationMapsUrl,
            meetingPoint: (event as any).meeting_point ?? undefined,
            meetingPointMapsUrl,
            competitionName: competitionLabel,
            squadList,
            teamName,
            clubName,
            clubLogoUrl,
            respondUrl: `${origin}/r/${token}`,
            isUpdate: true,
            changes: changes.map((c) => ({ label: c.label, previous: c.previous, current: c.current })),
            lineup: lineupEmail,
            locale: emailLocale(),
          },

        }).catch(() => undefined);

      const sends: Promise<unknown>[] = [];
      const inAppRecipients = new Set<string>();
      for (const c of convocations as any[]) {
        if (!c.response_token) continue;
        const player = c.players;
        const playerName = `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim();
        if (player?.email) {
          sends.push(sendOne(c.response_token, player.email, player.first_name ?? undefined, playerName, `p-${c.id}`));
        }
        if (player?.user_id) inAppRecipients.add(player.user_id);
        for (const parent of (parents ?? []).filter((p: any) => p.player_id === c.player_id)) {
          if (parent.email) {
            const parentFirst = (parent.full_name ?? "").split(" ")[0] || undefined;
            sends.push(sendOne(c.response_token, parent.email, parentFirst, playerName, `parent-${parent.player_id}-${c.id}`));
          }
          if (parent.parent_user_id) inAppRecipients.add(parent.parent_user_id);
        }
      }
      if (inAppRecipients.size > 0) {
        await supabase.from("notifications").insert(
          Array.from(inAppRecipients).map((uid) => ({
            user_id: uid,
            type: "convocation",
            title: `🔄 ${event.title}`,
              body: changes.length > 0
                ? t("events.resend.notifUpdated", { defaultValue: "Call-up updated: {{fields}}", fields: changes.map((ch) => ch.label).join(", ") })
                : t("events.resend.notifResent", { defaultValue: "Call-up resent" }),
              link: `/events/${event.id}`,
          })),
        );
      }
      await Promise.allSettled(sends);

      await supabase
        .from("events")
        .update({ convocation_sent_snapshot: buildConvocSnapshot(event), convocation_last_sent_at: new Date().toISOString() })
        .eq("id", event.id);

      toast.success(t("events.resend.success", { defaultValue: "Call-up resent to {{count}} player(s)", count: convocations.length }));
      setResendOpen(false);
      refetchEvent();
    } catch (e: any) {
      toast.error(e?.message ?? t("events.resend.error", { defaultValue: "Error while resending" }));
    } finally {
      setResendSubmitting(false);
    }
  }

  const convocChanges = useMemo(
    () => diffSnapshot((event as any)?.convocation_sent_snapshot, event, t),
    [event, t],
  );

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
    return <EventDetailSkeleton />;
  }

  const visibleMyConvocs = [...myConvocs, ...myChildConvocs];
  const hasPendingForMe =
    !event.responses_locked &&
    visibleMyConvocs.some((c: any) => c.status === "pending");
  const isPastMatch =
    event.type === "match" && new Date(event.starts_at).getTime() <= Date.now();
  const showFeedbackButton = isPastMatch && isCoach;

  return (
    <div className="px-5 pt-4 pb-24 md:pb-6 space-y-5 animate-in fade-in-0 duration-300">
      <Link
        to="/events"
        className="inline-flex items-center text-sm text-muted-foreground gap-1 hover:text-foreground transition-colors -ml-1 px-1 py-1 rounded-md"
      >
        <ChevronLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      <div
        className={cn(
          "relative rounded-2xl border bg-card shadow-sm overflow-hidden",
          "transition-shadow hover:shadow-md",
          event.type === "match"
            ? "border-primary/30"
            : "border-border"
        )}
      >
        {event.type === "match" && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 via-card to-card"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-primary/15 blur-3xl"
            />
          </>
        )}

        {/* Header: badges */}
        <div className="relative px-5 pt-5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-primary bg-primary/12 px-2 py-0.5 rounded-full ring-1 ring-primary/20">
              {t(`events.types.${event.type}`)}
            </span>
            {event.type === "match" && event.competition_type && (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-foreground/70 bg-muted px-2 py-0.5 rounded-full">
                {t(`events.competitionTypes.${event.competition_type}`)}
                {event.competition_name ? ` · ${event.competition_name}` : ""}
              </span>
            )}
            {event.type === "match" && event.is_home !== null && (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-foreground/70 bg-muted px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                {event.is_home ? <Home className="h-2.5 w-2.5" /> : <Plane className="h-2.5 w-2.5" />}
                {t(event.is_home ? "events.home" : "events.away")}
              </span>
            )}
          </div>
        </div>

        {/* Hero: date block + title */}
        <div className="relative px-5 pt-4 flex items-start gap-4">
          <div
            className={cn(
              "shrink-0 flex flex-col items-center justify-center w-16 rounded-xl border text-center py-2 leading-none",
              event.type === "match"
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-muted/40 text-foreground"
            )}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
              {fmt(event.starts_at, "MMM")}
            </div>
            <div className="text-2xl font-bold tabular-nums mt-0.5">
              {fmt(event.starts_at, "d")}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider opacity-70 mt-0.5">
              {fmt(event.starts_at, "EEE")}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className={cn(
              "font-bold tracking-tight leading-tight",
              event.type === "match" ? "text-2xl" : "text-xl"
            )}>
              {event.type === "match" && event.opponent ? (
                <span className="inline-flex items-baseline gap-2 flex-wrap">
                  <span>{teams?.[0]?.name ?? event.title}</span>
                  <span className="text-muted-foreground text-base font-medium">vs</span>
                  <span>{event.opponent}</span>
                </span>
              ) : event.title}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{fmt(event.starts_at, "HH:mm")}</span>
              {event.ends_at && <span>→ {fmt(event.ends_at, "HH:mm")}</span>}
              {event.convocation_time && (
                <span className="text-muted-foreground/80">· {t("events.convocationTime")} {fmt(event.convocation_time, "HH:mm")}</span>
              )}
            </p>
          </div>
        </div>

        {/* Info rows */}
        <div className="relative px-5 pt-4 space-y-2.5 text-sm text-muted-foreground">
          {event.location && (
            <div className="flex items-start gap-2.5">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-foreground/60" />
              <div className="flex-1 min-w-0">
                <p className="text-foreground">{event.location}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <a
                    href={
                      event.location_url ??
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                  >
                    {t("events.openInMaps")} <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href={`https://www.waze.com/ul?q=${encodeURIComponent(event.location)}&navigate=yes`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                  >
                    {t("events.openInWaze")} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          )}
          {event.type === "match" && event.is_home === false && event.meeting_point && (
            <div className="flex items-start gap-2.5">
              <Plane className="h-4 w-4 mt-0.5 shrink-0 text-foreground/60" />
              <div className="flex-1 min-w-0">
                <p className="text-foreground">
                  <span className="font-medium">{t("events.meetingPoint")}:</span> {event.meeting_point}
                </p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.meeting_point)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {t("events.openMeetingInMaps")} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}
          {event.description && (
            <p className="text-foreground/90 leading-relaxed pt-1">{event.description}</p>
          )}
          {(() => {
            const list = (event.attachments as unknown as Attachment[] | null) ?? [];
            return list.length > 0 ? (
              <div className="pt-1"><AttachmentList items={list} /></div>
            ) : null;
          })()}
        </div>

        {/* Primary action toolbar */}
        {teams && (isCoach || showFeedbackButton) && (
          <div className="relative px-5 pt-4 flex items-center gap-2 flex-wrap">
            {isCoach && event.type === "match" && (() => { const s = (teams?.[0]?.sport ?? "").toString().toLowerCase().trim(); return s === "football" || s === "foot" || s === "soccer"; })() && (
              <Link
                to="/events/$eventId/lineup"
                params={{ eventId }}
                className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-9 gap-1.5 flex-1 min-w-[7rem]")}
                title={t("lineup.title", { defaultValue: "Composition" })}
              >
                <CircleDot className="h-4 w-4" />
                <span>{t("lineup.title", { defaultValue: "Composition" })}</span>
              </Link>
            )}
            {showFeedbackButton && (
              <Link
                to="/events/$eventId/feedback"
                params={{ eventId }}
                className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-9 gap-1.5 flex-1 min-w-[7rem]")}
                title={t("feedback.postMatchTitle", { defaultValue: "Retours coach" })}
              >
                <ClipboardList className="h-4 w-4" />
                <span>{t("feedback.postMatchTitle", { defaultValue: "Retours coach" })}</span>
              </Link>
            )}
            {isCoach && (
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0 border border-border/60 hover:bg-primary/10 hover:border-primary/30"
                onClick={() => setEditOpen(true)}
                aria-label={t("common.edit", { defaultValue: "Modifier" })}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        {event.type === "match" && (() => { const s = (teams?.[0]?.sport ?? "").toString().toLowerCase().trim(); return s === "football" || s === "foot" || s === "soccer"; })() && (
          <div className="relative px-5 pt-4" ref={lineupCardRef}>
            <PublishedLineupCard eventId={eventId} teamId={event.team_id} />
          </div>
        )}

        {event.status === "cancelled" && (
          <div className="relative mx-5 mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
            <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
              <Ban className="h-4 w-4" />
              {t("events.eventCancelled")}
            </div>
            {event.cancellation_reason && (
              <p className="mt-1 text-sm text-foreground">
                <span className="font-medium">{t("events.cancellationReason")} : </span>
                {event.cancellation_reason}
              </p>
            )}
            {event.cancelled_at && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("events.eventCancelledOn", { date: fmt(event.cancelled_at, "d MMM yyyy 'à' HH:mm") })}
              </p>
            )}
          </div>
        )}

        {/* bottom spacer */}
        <div className="relative h-5" />
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

      {/* Convocation CTAs moved into the unified Convocation card below */}


      {/* Coach: secondary lifecycle actions */}
      {isCoach && event.status !== "cancelled" && (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={openReschedule}
            className="flex-1 h-9 text-muted-foreground hover:text-foreground border border-border/60 hover:bg-muted/60"
          >
            <CalendarClock className="h-4 w-4" />
            {t("events.reschedule")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCancelEventOpen(true)}
            className="flex-1 h-9 text-destructive/80 hover:text-destructive border border-destructive/20 hover:bg-destructive/10"
          >
            <Ban className="h-4 w-4" />
            {t("events.cancelEvent")}
          </Button>
        </div>
      )}

      <Dialog
        open={rescheduleOpen}
        onOpenChange={(o) => {
          if (!o && !rescheduleSubmitting) {
            setRescheduleOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("events.rescheduleTitle")}</DialogTitle>
            <DialogDescription>{t("events.rescheduleDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("events.rescheduleNewDateLabel")}</label>
              <input
                type="datetime-local"
                value={rescheduleNewDate}
                onChange={(e) => setRescheduleNewDate(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("events.rescheduleReasonLabel")}</label>
              <Textarea
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder={t("events.rescheduleReasonPlaceholder")}
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRescheduleOpen(false)}
              disabled={rescheduleSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={confirmReschedule}
              disabled={rescheduleSubmitting || !rescheduleNewDate}
            >
              {rescheduleSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("events.rescheduleConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Coach: WhatsApp sharing (V1 — deep links, no API) */}
      {isCoach && (() => {
        const team = teams?.[0] as any;
        if (!team) return null;
        const mode = (team.communication_mode ?? "app") as "app" | "whatsapp" | "hybrid";
        const groupUrl = normalizeGroupUrl(team.whatsapp_group_url);
        const clubName = team.clubs?.name ?? undefined;
        const teamName = team.name ?? undefined;
        const competitionLabel = (event as any).competition_name
          || ((event as any).competition_type ? t(`events.competitionTypes.${(event as any).competition_type}`) : undefined);
        const selectedPlayers = (convocations ?? [])
          .map((c: any) => `${c.players?.first_name ?? ""} ${c.players?.last_name ?? ""}`.trim())
          .filter(Boolean);
        const base = {
          clubName,
          teamName,
          type: event.type,
          title: event.title,
          opponent: event.opponent,
          isHome: event.is_home,
          competitionLabel,
          startsAt: event.starts_at,
          endsAt: event.ends_at,
          convocationTime: (event as any).convocation_time,
          location: event.location,
          locationUrl: (event as any).location_url,
          meetingPoint: (event as any).meeting_point,
          description: event.description,
          attachments: (event.attachments as any) ?? [],
          selectedPlayers,
          cancellationReason: event.cancellation_reason,
          lineup: null,
        };
        const lineupBlock = lineupData
          ? {
              formation: lineupData.formation,
              starting: (lineupData as any)._starting ?? [],
              bench: (lineupData as any)._bench ?? [],
            }
          : null;
        const respondents = (() => {
          const buckets: { present: string[]; absent: string[]; uncertain: string[]; pending: string[] } = {
            present: [], absent: [], uncertain: [], pending: [],
          };
          for (const c of (convocations ?? []) as any[]) {
            const p = c.players ?? {};
            const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
            if (c.status === "present") buckets.present.push(name);
            else if (c.status === "absent") buckets.absent.push(name);
            else if (c.status === "uncertain") buckets.uncertain.push(name);
            else buckets.pending.push(name);
          }
          return buckets;
        })();
        const isCancelled = event.status === "cancelled";
        const convocMsg = isCancelled
          ? buildCancellationMessage(base)
          : buildConvocationMessage(base);
        const convocWithCompoMsg = buildConvocationMessage({ ...base, lineup: lineupBlock });
        const reminderMsg = buildReminderMessage({ ...base, respondents });
        return (
          <div className="rounded-2xl border border-[#25D366]/30 bg-[#25D366]/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MessageCircle className="h-4 w-4 text-[#25D366]" />
                <span>WhatsApp</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                  {mode === "whatsapp" ? t("events.whatsappShare.modeWhatsappOnly") : mode === "hybrid" ? t("events.whatsappShare.modeHybrid") : t("events.whatsappShare.modeQuickShare")}
                </span>
              </div>
              {groupUrl && (
                <a
                  href={groupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[#075E54] inline-flex items-center gap-1"
                >
                  {t("events.whatsappShare.openGroup")} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {isCancelled ? (
              <a
                href={`https://wa.me/?text=${encodeURIComponent(convocMsg)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-md bg-[#25D366] text-white hover:bg-[#1ebe5b] text-sm font-medium"
              >
                <MessageCircle className="h-4 w-4" />
                {t("events.whatsappShare.shareCancellation")}
              </a>
            ) : (
              <>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(convocMsg)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-md bg-[#25D366] text-white hover:bg-[#1ebe5b] text-sm font-medium"
                >
                  <MessageCircle className="h-4 w-4" />
                  {t("events.whatsappShare.shareConvoc")}
                </a>
                {lineupData && (
                  <button
                    type="button"
                    onClick={() => shareLineupAsImage(convocWithCompoMsg)}
                    disabled={sharingLineup}
                    className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-md bg-[#075E54] text-white hover:bg-[#064a42] text-sm font-medium disabled:opacity-60"
                  >
                    {sharingLineup ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                    {t("events.whatsappShare.shareConvocWithLineup")}
                  </button>
                )}
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(reminderMsg)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-md border border-input bg-background hover:bg-accent text-sm font-medium"
                >
                  <Bell className="h-4 w-4" />
                  {t("events.whatsappShare.reminder")}
                </a>
                <p className="text-[11px] text-muted-foreground pl-1">
                  {lineupData ? t("events.whatsappShare.reminderHintWithLineup") : t("events.whatsappShare.reminderHint")}
                </p>

              </>
            )}
          </div>
        );
      })()}

      <Dialog
        open={cancelEventOpen}
        onOpenChange={(o) => {
          if (!o && !cancelEventSubmitting) {
            setCancelEventOpen(false);
            setCancelEventReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("events.cancelEventTitle")}</DialogTitle>
            <DialogDescription>{t("events.cancelEventDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("events.cancelEventReasonLabel")}</label>
            <Textarea
              value={cancelEventReason}
              onChange={(e) => setCancelEventReason(e.target.value)}
              placeholder={t("events.cancelEventReasonPlaceholder")}
              rows={3}
              maxLength={500}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelEventOpen(false);
                setCancelEventReason("");
              }}
              disabled={cancelEventSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={confirmCancelEvent}
              disabled={cancelEventSubmitting || !cancelEventReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelEventSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("events.cancelEventConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resend convocation dialog */}
      <Dialog open={resendOpen} onOpenChange={(o) => { if (!resendSubmitting) setResendOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("events.resend.title", { defaultValue: "Resend call-up" })}</DialogTitle>
            <DialogDescription>
              {convocChanges.length > 0
                ? t("events.resend.descChanges", { defaultValue: "{{count}} change(s) detected since the last send. The email will highlight what changed.", count: convocChanges.length })
                : t("events.resend.descNoChanges", { defaultValue: "No changes detected since the last send. The call-up will still be resent to all players." })}
            </DialogDescription>
          </DialogHeader>
          {convocChanges.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2 max-h-64 overflow-auto">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">{t("events.resend.changesHeader", { defaultValue: "Changes" })}</p>
              {convocChanges.map((c) => (
                <div key={c.field} className="text-sm">
                  <span className="font-medium text-amber-900">{c.label} : </span>
                  <span className="text-muted-foreground line-through">{c.previous ?? "—"}</span>
                  {" → "}
                  <span className="font-semibold text-emerald-700">{c.current ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t("events.resend.recipientsHint", { defaultValue: "Sent to {{count}} player(s) (+ parents). Existing responses are preserved.", count: convocations?.length ?? 0 })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResendOpen(false)} disabled={resendSubmitting}>
              {t("common.cancel")}
            </Button>
            <Button onClick={resendConvocations} disabled={resendSubmitting}>
              {resendSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <Send className="h-4 w-4" />
              {t("events.resend.confirm", { defaultValue: "Resend" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={pickerOpen} onOpenChange={(o) => { setPickerOpen(o); if (!o) setPickerStep("select"); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pickerStep === "select"
                ? t("attendance.selectPlayers")
                : t("attendance.reviewBeforeSend", { defaultValue: "Vérifier avant envoi" })}
            </DialogTitle>
            <DialogDescription>
              {pickerStep === "select"
                ? t("attendance.selectPlayersHint")
                : t("attendance.reviewBeforeSendHint", {
                    defaultValue: "Vérifie les destinataires et les détails — l'envoi est définitif.",
                    count: selectedIds.size,
                  })}
            </DialogDescription>
          </DialogHeader>
          {teamPlayers && pickerStep === "select" && (
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
          {teamPlayers && pickerStep === "review" && (
            <div className="space-y-3">
              <div className="rounded-xl border bg-muted/40 p-3 space-y-1 text-sm">
                <p className="font-semibold">{event.title}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {fmt(event.starts_at, "EEEE d MMMM · HH:mm")}
                </p>
                {event.location && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1">
                    <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="truncate">{event.location}</span>
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {t("attendance.recipients", { defaultValue: "Destinataires" })} ({selectedIds.size})
                </p>
                <div className="max-h-48 overflow-y-auto rounded-xl border divide-y">
                  {teamPlayers
                    .filter((tp: any) => selectedIds.has(tp.player_id))
                    .map((tp: any) => {
                      const p = tp.players;
                      return (
                        <div key={tp.player_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <span className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold shrink-0">
                            {(p?.first_name?.[0] ?? "") + (p?.last_name?.[0] ?? "")}
                          </span>
                          <span className="truncate">
                            {p?.first_name} {p?.last_name}
                            {p?.jersey_number ? (
                              <span className="text-muted-foreground"> · #{p.jersey_number}</span>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            {pickerStep === "select" ? (
              <>
                <Button variant="outline" onClick={() => setPickerOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={() => setPickerStep("review")}
                  disabled={selectedIds.size === 0}
                >
                  {t("common.continue", { defaultValue: "Continuer" })} ({selectedIds.size})
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setPickerStep("select")} disabled={sending}>
                  {t("common.back")}
                </Button>
                <Button onClick={sendConvocations} disabled={sending || selectedIds.size === 0}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {t("attendance.confirmSend", { defaultValue: "Confirmer l'envoi" })}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* "My response" merged into the unified Convocation card below */}


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

      {/* === Unified Convocation card === */}
      {(event.convocations_sent || (isCoach && event.status !== "cancelled") || visibleMyConvocs.length > 0) && (
        <section id="my-response" className="rounded-2xl border border-border bg-card overflow-hidden scroll-mt-20">
          {/* Header */}
          <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight">
                {t("attendance.title", { defaultValue: "Convocation" })}
              </h2>
              {event.convocations_sent ? (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span>
                    {(convocations?.length ?? 0) - counts.pending}/{convocations?.length ?? 0}{" "}
                    {t("attendance.responded", { defaultValue: "réponses" })}
                  </span>
                  {event.responses_locked && (
                    <span className="inline-flex items-center gap-0.5 text-pending-foreground">
                      · <Lock className="h-3 w-3" />
                    </span>
                  )}
                  {convocChanges.length > 0 && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-900 px-1.5 py-0.5 text-[10px] font-semibold">
                      {t("events.resend.updatesBadge", { defaultValue: "{{count}} update(s)", count: convocChanges.length })}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("attendance.notSentYet", { defaultValue: "Pas encore envoyée" })}
                </p>
              )}
            </div>
            {isCoach && event.status !== "cancelled" && event.convocations_sent && (
              <div className="flex items-center gap-1 shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {counts.pending > 0 && (
                      <DropdownMenuItem onClick={remindAllPending}>
                        <Bell className="h-4 w-4" /> {t("attendance.remindAll")}
                      </DropdownMenuItem>
                    )}
                    {teamPlayers && teamPlayers.length > (convocations?.length ?? 0) && (
                      <DropdownMenuItem onClick={() => openPicker()}>
                        <UserPlus className="h-4 w-4" /> {t("attendance.addMorePlayers")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={toggleLock}>
                      {event.responses_locked ? (
                        <><Unlock className="h-4 w-4" /> {t("attendance.unlockResponses", { defaultValue: "Unlock responses" })}</>
                      ) : (
                        <><Lock className="h-4 w-4" /> {t("attendance.lockResponses", { defaultValue: "Lock responses" })}</>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const rows = (convocations ?? []).map((c: any) => ({
                          last_name: c.players?.last_name ?? "",
                          first_name: c.players?.first_name ?? "",
                          jersey_number: c.players?.jersey_number ?? "",
                          status: c.status,
                          comment: c.comment ?? "",
                        }));
                        const csv = toCsv(rows, [
                          { key: "last_name", header: t("players.lastName", { defaultValue: "Last name" }) },
                          { key: "first_name", header: t("players.firstName", { defaultValue: "First name" }) },
                          { key: "jersey_number", header: "#" },
                          { key: "status", header: t("attendance.status", { defaultValue: "Status" }) },
                          { key: "comment", header: t("common.comment", { defaultValue: "Comment" }) },
                        ]);
                        downloadCsv(`${event.title}-attendance`, csv);
                      }}
                    >
                      <Download className="h-4 w-4" /> {t("common.exportCsv", { defaultValue: "Export CSV" })}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </header>

          {/* Coach: send convocations the first time */}
          {isCoach && event.status !== "cancelled" && event.convocations_sent && (
            <div className="p-4 border-b border-border">
              <Button
                onClick={() => setResendOpen(true)}
                variant={convocChanges.length > 0 ? "default" : "outline"}
                className="w-full h-11"
              >
                <Send className="h-4 w-4" />
                {convocChanges.length > 0
                  ? t("events.resend.buttonWithChanges", { defaultValue: "Resend call-up ({{count}} update(s))", count: convocChanges.length })
                  : t("events.resend.button", { defaultValue: "Resend call-up" })}
              </Button>
              {convocChanges.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
                  {t("events.resend.changesDetected", { defaultValue: "Changes were detected since the last send." })}
                </p>
              )}
            </div>
          )}

          {isCoach && event.status !== "cancelled" && !event.convocations_sent && (
            <div className="p-4">
              <Button onClick={() => openPicker()} className="w-full h-11">
                <Send className="h-4 w-4" />
                {t("events.sendConvocations")}
              </Button>
            </div>
          )}

          {/* My response — big colored icon + label buttons */}
          {visibleMyConvocs.length > 0 && (
            <div className="px-4 py-4 space-y-4 border-b border-border">
              {visibleMyConvocs.map((c: any) => {
                const playerLabel = `${c.players?.first_name ?? ""} ${c.players?.last_name ?? ""}`.trim();
                return (
                  <div key={c.id}>
                    <p className="text-sm font-medium mb-2.5">
                      {visibleMyConvocs.length > 1 ? (
                        <>
                          {t("attendance.respondPrompt")}
                          <span className="text-muted-foreground font-normal"> · {playerLabel}</span>
                        </>
                      ) : (
                        t("attendance.respondPrompt")
                      )}
                    </p>
                    {event.responses_locked ? (
                      <p className="text-xs text-muted-foreground">{t("attendance.responsesLocked")}</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {(["present", "uncertain", "absent"] as AttendanceStatus[]).map((s) => {
                          const Icon = s === "present" ? CheckCircle2 : s === "absent" ? XCircle : HelpCircle;
                          const active = c.status === s;
                          const inactiveTint =
                            s === "present"
                              ? "border-present/25 bg-present/5 text-present hover:bg-present/10 hover:border-present/50"
                              : s === "absent"
                                ? "border-absent/25 bg-absent/5 text-absent hover:bg-absent/10 hover:border-absent/50"
                                : "border-uncertain/30 bg-uncertain/5 text-uncertain-foreground hover:bg-uncertain/15 hover:border-uncertain/60";
                          const activeTint =
                            s === "present"
                              ? "bg-present text-present-foreground border-present shadow-md shadow-present/20 ring-2 ring-present/30"
                              : s === "absent"
                                ? "bg-absent text-white border-absent shadow-md shadow-absent/20 ring-2 ring-absent/30"
                                : "bg-uncertain text-uncertain-foreground border-uncertain shadow-md shadow-uncertain/20 ring-2 ring-uncertain/30";
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => respond(c.id, s)}
                              className={cn(
                                "group flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 border-2 font-medium transition-all duration-150 active:scale-[0.97]",
                                active ? activeTint : inactiveTint,
                              )}
                            >
                              <Icon
                                className={cn(
                                  "h-6 w-6 transition-transform",
                                  active ? "scale-110" : "group-hover:scale-105",
                                )}
                                strokeWidth={active ? 2.5 : 2}
                              />
                              <span className="text-[13px] font-semibold tracking-tight">{t(`attendance.${s}`)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Stats + players list (visible once convocations are sent) */}
          {event.convocations_sent && (
            <>
              {isCoach && (() => {
                const total = counts.present + counts.uncertain + counts.absent + counts.pending;
                const responded = total - counts.pending;
                const rate = total === 0 ? 0 : Math.round((responded / total) * 100);
                const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
                return (
                  <div className="px-4 pt-4">
                    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/40 p-4 shadow-sm">
                      <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
                      <div className="relative flex items-end justify-between gap-3 mb-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                            {t("attendance.responseRate", { defaultValue: "Taux de réponse" })}
                          </p>
                          <div className="flex items-baseline gap-1.5 mt-1">
                            <span className="text-4xl font-bold tabular-nums leading-none tracking-tight">{rate}</span>
                            <span className="text-lg font-semibold text-muted-foreground">%</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums leading-tight">
                            {responded}<span className="text-muted-foreground font-normal">/{total}</span>
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                            {t("attendance.responded", { defaultValue: "réponses" })}
                          </p>
                        </div>
                      </div>

                      {/* Segmented progress bar */}
                      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/60 flex">
                        {counts.present > 0 && (
                          <div style={{ width: `${pct(counts.present)}%` }} className="bg-present transition-all" />
                        )}
                        {counts.uncertain > 0 && (
                          <div style={{ width: `${pct(counts.uncertain)}%` }} className="bg-uncertain transition-all" />
                        )}
                        {counts.absent > 0 && (
                          <div style={{ width: `${pct(counts.absent)}%` }} className="bg-absent transition-all" />
                        )}
                      </div>

                      {/* Chips */}
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        <StatChip dotCls="bg-present" label={t("attendance.present")} value={counts.present} />
                        <StatChip dotCls="bg-uncertain" label={t("attendance.uncertain")} value={counts.uncertain} />
                        <StatChip dotCls="bg-absent" label={t("attendance.absent")} value={counts.absent} />
                        <StatChip dotCls="bg-pending border border-border" label={t("attendance.pending")} value={counts.pending} muted />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {isCoach && counts.pending > 0 && (
                <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl border border-pending/40 bg-pending/10 px-3 py-2.5">
                  <p className="text-xs font-medium text-pending-foreground">
                    {t("attendance.pendingCount", { count: counts.pending })}
                  </p>
                  <Button size="sm" className="h-8" onClick={remindAllPending}>
                    <Bell className="h-3.5 w-3.5" /> {t("attendance.remindAll")}
                  </Button>
                </div>
              )}

              {convocations && convocations.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {t("attendance.noConvokedPlayers")}
                </div>
              ) : (
                <ul className="mt-3 border-t border-border">
                  {sortedConvocations.map((c: any) => {
                    const accent =
                      c.status === "present" ? "bg-present"
                      : c.status === "absent" ? "bg-absent"
                      : c.status === "uncertain" ? "bg-uncertain"
                      : "bg-pending";
                    const ringCls =
                      c.status === "present" ? "ring-2 ring-present/40"
                      : c.status === "absent" ? "ring-2 ring-absent/40"
                      : c.status === "uncertain" ? "ring-2 ring-uncertain/40"
                      : "ring-1 ring-border";
                    return (
                    <li key={c.id} className="relative flex flex-col gap-2 px-3 py-2.5 border-b border-border last:border-b-0 sm:flex-row sm:items-center sm:justify-between hover:bg-muted/30 transition-colors">
                      <span className={cn("absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full", accent)} />
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 pl-1.5">
                        <div className={cn("h-8 w-8 shrink-0 rounded-full bg-muted overflow-hidden", ringCls)}>
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
                      <div className="flex w-full items-center gap-1 shrink-0 sm:w-auto">
                        {isCoach ? (
                          <>
                            <div className="grid flex-1 grid-cols-3 gap-1 rounded-xl border bg-background/80 p-1 sm:flex sm:flex-none sm:rounded-full sm:gap-0.5 sm:p-0.5">
                              {ATTENDANCE_ACTIONS.filter(a => a.status !== "pending").map(({ status, Icon, className }) => (
                                <Button
                                  key={status}
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className={cn(
                                    "h-8 min-w-0 rounded-lg px-1.5 text-[11px] sm:h-7 sm:rounded-full sm:px-2",
                                    c.status === status
                                      ? status === "present" ? "bg-present text-present-foreground hover:bg-present hover:text-present-foreground"
                                        : status === "absent" ? "bg-absent text-white hover:bg-absent hover:text-white"
                                        : "bg-uncertain text-uncertain-foreground hover:bg-uncertain hover:text-uncertain-foreground"
                                      : className,
                                  )}
                                  onClick={() => coachChangeStatus(c, status)}
                                  title={t(`attendance.${status}`)}
                                  aria-label={t(`attendance.${status}`)}
                                >
                                  <Icon className="h-4 w-4" />
                                  <span className="truncate">{t(`attendance.${status}`)}</span>
                                </Button>
                              ))}
                            </div>
                            {c.status === "pending" && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-pending-foreground" onClick={() => remind(c.id)} title={t("attendance.remind")}>
                                <Bell className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground"
                              onClick={() => setDetailConvocId(c.id)}
                              title={t("attendance.details")}
                            >
                              <Info className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <AttendancePill status={c.status} />
                        )}
                      </div>
                    </li>
                    );
                  })}
                </ul>
              )}
            </>
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
        onChangeStatus={(id, status) => {
          const conv = (convocations ?? []).find((x: any) => x.id === id);
          if (conv) coachChangeStatus(conv, status);
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

      <AlertDialog open={!!coachOverrideTarget} onOpenChange={(o) => !o && setCoachOverrideTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("attendance.forceResponseTitle", { defaultValue: "Force response?" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {coachOverrideTarget ? (
                <>
                  {t("attendance.forceResponseDesc", {
                    defaultValue: "{{name}} already responded {{current}}. Do you really want to force their status to {{next}}?",
                    name: coachOverrideTarget.playerName,
                    current: t(`attendance.${coachOverrideTarget.currentStatus}`),
                    next: t(`attendance.${coachOverrideTarget.status}`),
                  })}
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (coachOverrideTarget) {
                  submitResponse(coachOverrideTarget.id, coachOverrideTarget.status, null);
                }
                setCoachOverrideTarget(null);
              }}
            >
              Forcer
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
          {respondTarget && (() => {
            const presetsKey =
              respondTarget.status === "absent"
                ? "attendance.reasonsAbsent"
                : "attendance.reasonsUncertain";
            const presets = (t(presetsKey, { returnObjects: true }) as unknown);
            const list = Array.isArray(presets) ? (presets as string[]) : [];
            if (list.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1.5 -mb-1">
                {list.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setRespondReason(p)}
                    className={cn(
                      "text-xs rounded-full border px-2.5 py-1 transition-colors",
                      respondReason === p
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/40",
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            );
          })()}
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

function StatChip({ dotCls, label, value, muted }: { dotCls: string; label: string; value: number; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors",
        muted
          ? "border-border bg-background text-muted-foreground"
          : "border-border bg-background/60 text-foreground",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", dotCls)} />
      <span className="font-semibold">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
