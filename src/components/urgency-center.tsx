import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  HandHelping,
  HelpCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useUrgencies } from "@/lib/urgency/use-urgencies";
import { dispatchUrgencyAction } from "@/lib/urgency/dispatcher";
import { selectSurfaceState } from "@/lib/urgency/pure";
import { remindAllForEvent } from "@/lib/urgency/remind";
import { dispatchConvocationResponsePush } from "@/lib/push-dispatch.functions";
import { notifyCoachesEmail } from "@/lib/convocation-notify.functions";
import { applyToEventNeed, declareUnavailable } from "@/lib/needs/needs.functions";
import type { UrgencyAction, UrgencyItem, UrgencySeverity } from "@/lib/urgency/types";

const DISMISS_STORAGE_KEY = "clubero:urgency:dismissed";
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

type DismissMap = Record<string, number>;

function readDismissed(): DismissMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DismissMap;
    const now = Date.now();
    const fresh: DismissMap = {};
    for (const [id, ts] of Object.entries(parsed)) {
      if (now - ts < DISMISS_TTL_MS) fresh[id] = ts;
    }
    return fresh;
  } catch {
    return {};
  }
}

function writeDismissed(map: DismissMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

interface Props {
  className?: string;
}

const SEV_RING: Record<UrgencySeverity, string> = {
  critical: "border-[#fecaca]",
  high: "border-[#fde68a]",
  medium: "border-border",
};

const SEV_BAR: Record<UrgencySeverity, string> = {
  critical: "bg-[#dc2626]",
  high: "bg-[#f59e0b]",
  medium: "bg-[#fcd34d]",
};

const SEV_TILE: Record<UrgencySeverity, string> = {
  critical: "bg-[#fee2e2] text-[#dc2626]",
  high: "bg-[#fef3c7] text-[#b45309]",
  medium: "bg-[#fefce8] text-[#854d0e]",
};

const SEV_BADGE_LABEL: Record<UrgencySeverity, string> = {
  critical: "urgency.badge.urgent",
  high: "urgency.badge.important",
  medium: "urgency.badge.info",
};

const SEV_BADGE_CLASS: Record<UrgencySeverity, string> = {
  critical: "bg-[#fee2e2] text-[#b91c1c]",
  high: "bg-[#fef3c7] text-[#92400e]",
  medium: "bg-[#fefce8] text-[#854d0e]",
};

function ActionIcon({ kind }: { kind: UrgencyAction["kind"] }) {
  if (kind === "remind-all" || kind === "remind-one")
    return <BellRing className="h-3.5 w-3.5" strokeWidth={2.4} />;
  if (kind === "respond") return <Bell className="h-3.5 w-3.5" strokeWidth={2.4} />;
  if (kind === "open-need") return <HandHelping className="h-3.5 w-3.5" strokeWidth={2.4} />;
  return <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} />;
}

export function UrgencyCenter({ className }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { items: rawItems, status } = useUrgencies();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<DismissMap>(() => readDismissed());
  const [expanded, setExpanded] = useState(false);
  const dispatchResponsePushFn = useServerFn(dispatchConvocationResponsePush);
  const notifyCoachesEmailFn = useServerFn(notifyCoachesEmail);
  const applyNeedFn = useServerFn(applyToEventNeed);
  const declareUnavailableFn = useServerFn(declareUnavailable);

  useEffect(() => {
    // Re-prune at mount in case TTL expired since last write.
    const fresh = readDismissed();
    setDismissed(fresh);
    writeDismissed(fresh);
  }, []);

  const items = rawItems.filter((i) => !dismissed[i.id]);

  function dismissItem(id: string) {
    setDismissed((prev) => {
      const next = { ...prev, [id]: Date.now() };
      writeDismissed(next);
      return next;
    });
  }

  const surface = selectSurfaceState(status, items.length);

  const hasFailures = status.failedSources.length > 0;

  // TEMP DEBUG — log which insight sources failed so we can diagnose the partial banner.
  useEffect(() => {
    if (hasFailures) {
      console.warn("[UrgencyCenter] failed sources:", status.failedSources, {
        errors: (status as any).errors,
        status,
      });
    }
  }, [hasFailures, status]);

  if (surface === "pending") {
    return (
      <section className={cn("space-y-2", className)}>
        <Skeleton className="h-20 w-full rounded-[16px]" />
        <Skeleton className="h-16 w-full rounded-[16px]" />
      </section>
    );
  }

  if (surface === "error") {
    // Vérif échouée : repli discret, jamais "tout est sous contrôle".
    return (
      <section
        className={cn(
          "flex items-center justify-between gap-3 px-1 py-1.5 text-[11px] text-muted-foreground",
          className,
        )}
        aria-live="polite"
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-3.5 w-3.5 text-[#f59e0b] shrink-0" strokeWidth={2.4} />
          <span className="font-medium truncate">
            {t("urgency.error.checkFailed", {
              defaultValue: "Impossible de vérifier les alertes",
            })}
          </span>
        </div>
        <button
          type="button"
          onClick={() => qc.invalidateQueries({ queryKey: ["urgency"], exact: false })}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-foreground hover:text-[#2d9d5f] transition-colors shrink-0"
        >
          <RefreshCw className="h-3 w-3" strokeWidth={2.6} />
          {t("common.retry", { defaultValue: "Réessayer" })}
        </button>
      </section>
    );
  }

  if (surface === "empty") {
    // Vide confirmé : ligne de statut sobre avec une pastille verte.
    // Pas de carte pleine, pas de fausse réassurance.
    return (
      <section
        className={cn(
          "flex items-center gap-2 px-1 py-1.5 text-[11px] text-muted-foreground",
          className,
        )}
        aria-live="polite"
      >
        <span className="inline-flex h-2 w-2 rounded-full bg-primary" aria-hidden />
        <span className="font-medium">
          {t("urgency.empty.status", {
            defaultValue: "Tout est sous contrôle · aucune action urgente",
          })}
        </span>
      </section>
    );
  }

  // 3 & 5. items présents — liste, avec liseré si erreur partielle.
  async function handleAction(item: UrgencyItem) {
    setBusyIds((s) => new Set(s).add(item.id));
    try {
      await dispatchUrgencyAction(item.primaryAction, {
        navigate: (to) => navigate({ to } as never),
        remindAll: async (eventId) => {
          if (!user) return;
          const sent = await remindAllForEvent(
            eventId,
            user.id,
            t("attendance.respondPrompt"),
            item.title,
          );
          if (sent > 0) toast.success(t("attendance.remindAllSent", { count: sent }));
          else toast.info(t("attendance.alreadyRemindedRecently"));
          qc.invalidateQueries({ queryKey: ["urgency"], exact: false });
        },
      });
    } catch (e) {
      toast.error(t("common.errorOccurred", { defaultValue: "Une erreur est survenue" }));
    } finally {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    }
  }

  async function handleQuickRespond(item: UrgencyItem, status: "present" | "uncertain" | "absent") {
    const convocationId = item.quickRespondConvocationId;
    if (!convocationId) return;
    setBusyIds((s) => new Set(s).add(item.id));
    try {
      const { error } = await supabase
        .from("convocations")
        .update({ status, responded_at: new Date().toISOString() })
        .eq("id", convocationId);
      if (error) {
        const raw = (error.message || "").toLowerCase();
        if (raw.includes("past_event_locked")) {
          toast.error(
            t("attendance.errorPastEventLocked", {
              defaultValue: "L'événement est passé — les réponses ne peuvent plus être modifiées.",
            }),
          );
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success(t("attendance.responseRecorded", { defaultValue: "Réponse enregistrée" }));
      // Fire-and-forget push + email — same as events/$eventId.tsx flow.
      void dispatchResponsePushFn({ data: { convocationId } }).catch(() => {});
      if (status === "absent" || status === "uncertain") {
        // In-app notifications for coaches + email — mirrors events/$eventId flow.
        void (async () => {
          try {
            const { data: conv } = await supabase
              .from("convocations")
              .select(
                "id, comment, event_id, player_id, players:player_id(user_id, first_name, last_name), events:event_id(id, title, team_id)",
              )
              .eq("id", convocationId)
              .maybeSingle();
            const ev: any = (conv as any)?.events;
            const pl: any = (conv as any)?.players;
            if (ev?.team_id) {
              const playerName =
                `${pl?.first_name ?? ""} ${pl?.last_name ?? ""}`.trim() || "Un joueur";
              const { data: coaches } = await supabase
                .from("team_members")
                .select("user_id")
                .eq("team_id", ev.team_id)
                .in("role", ["coach", "admin"]);
              const coachIds = Array.from(
                new Set((coaches ?? []).map((c: any) => c.user_id).filter(Boolean)),
              );
              let declaredByName: string | null = null;
              if (user && pl?.user_id && pl.user_id !== user.id) {
                const { data: prof } = await supabase
                  .from("profiles")
                  .select("first_name, full_name")
                  .eq("id", user.id)
                  .maybeSingle();
                declaredByName =
                  (prof as any)?.first_name ||
                  ((prof as any)?.full_name ?? "").split(" ")[0] ||
                  null;
              }
              if (coachIds.length > 0) {
                const reason = (conv as any)?.comment as string | null;
                const baseBody = reason ? `${ev.title} — "${reason}"` : ev.title;
                const body = declaredByName
                  ? `${baseBody} — ${t("notification.declaredBy", { name: declaredByName, defaultValue: `déclaré par ${declaredByName}` })}`
                  : baseBody;
                await supabase.from("notifications").insert(
                  coachIds.map((uid: string) => ({
                    user_id: uid,
                    type: "convocation_response",
                    title: `${playerName} : ${t(`attendance.${status}`)}`,
                    body,
                    link: `/events/${ev.id}`,
                  })),
                );
              }
            }
          } catch {
            /* best-effort */
          }
        })();
        void notifyCoachesEmailFn({ data: { convocationId } }).catch((e) => {
          console.error("[urgency] notifyCoachesEmail failed", e);
        });
      }
      dismissItem(item.id);
      qc.invalidateQueries({ queryKey: ["urgency"], exact: false });
      qc.invalidateQueries({ queryKey: ["my-convocs-home"], exact: false });
      qc.invalidateQueries({ queryKey: ["upcoming"], exact: false });
    } catch (e) {
      toast.error(t("common.errorOccurred", { defaultValue: "Une erreur est survenue" }));
    } finally {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    }
  }

  async function handleNeedRespond(item: UrgencyItem, choice: "available" | "unavailable") {
    if (item.primaryAction.kind !== "open-need") return;
    const needId = item.primaryAction.needId;
    setBusyIds((s) => new Set(s).add(item.id));
    try {
      if (choice === "available") {
        await applyNeedFn({ data: { need_id: needId } });
        toast.success(t("needs:insight.appliedToast", { defaultValue: "Candidature envoyée" }));
      } else {
        await declareUnavailableFn({ data: { need_id: needId } });
        toast.success(
          t("needs:insight.unavailableToast", { defaultValue: "Indisponibilité enregistrée" }),
        );
      }
      dismissItem(item.id);
      qc.invalidateQueries({ queryKey: ["urgency"], exact: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(
        t(`needs:errors.${msg}`, {
          defaultValue: t("common.errorOccurred", { defaultValue: "Une erreur est survenue" }),
        }),
      );
    } finally {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    }
  }

  const VISIBLE_LIMIT = 5;
  const visibleItems = expanded ? items : items.slice(0, VISIBLE_LIMIT);
  const hiddenCount = Math.max(0, items.length - VISIBLE_LIMIT);

  return (
    <UrgencyDeck
      items={visibleItems}
      hasFailures={hasFailures}
      busyIds={busyIds}
      onAction={handleAction}
      onQuickRespond={handleQuickRespond}
      onNeedRespond={handleNeedRespond}
      onDismiss={(id) => {
        dismissItem(id);
      }}
      onRefresh={() => qc.invalidateQueries({ queryKey: ["urgency"], exact: false })}
      className={className}
      failedSourcesDebug={status.failedSources.join(", ")}
      footer={
        hiddenCount > 0 && !expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full mt-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-bold text-foreground bg-card border-[1.5px] border-border rounded-full px-3 py-2 hover:border-primary hover:text-primary transition-colors"
          >
            {t("urgency.deck.showMore", {
              count: hiddenCount,
              defaultValue: "+ {{count}} autres échéances",
            })}
          </button>
        ) : null
      }
    />
  );
}

interface DeckProps {
  items: UrgencyItem[];
  hasFailures: boolean;
  busyIds: Set<string>;
  onAction: (item: UrgencyItem) => void | Promise<void>;
  onQuickRespond: (
    item: UrgencyItem,
    status: "present" | "uncertain" | "absent",
  ) => void | Promise<void>;
  onNeedRespond: (item: UrgencyItem, choice: "available" | "unavailable") => void | Promise<void>;
  onDismiss: (id: string) => void;
  onRefresh: () => void;
  className?: string;
  footer?: React.ReactNode;
  failedSourcesDebug?: string;
}

const SWIPE_THRESHOLD = 90; // px

function UrgencyDeck({
  items,
  hasFailures,
  busyIds,
  onAction,
  onQuickRespond,
  onNeedRespond,
  onDismiss,
  onRefresh,
  className,
  footer,
  failedSourcesDebug,
}: DeckProps) {
  const { t } = useTranslation();
  const [topIdx, setTopIdx] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [flyingOut, setFlyingOut] = useState<null | "left" | "right">(null);
  const startX = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Clamp topIdx if items shrink (dismissal from elsewhere, resolved server-side, etc.)
  useEffect(() => {
    if (topIdx >= items.length) setTopIdx(Math.max(0, items.length - 1));
  }, [items.length, topIdx]);

  const remaining = items.slice(topIdx);
  const current = remaining[0];

  if (!current) {
    // All local items consumed but parent still gave us items — should not happen after clamp,
    // but render nothing rather than crash.
    return null;
  }

  const deck = remaining.slice(0, 3); // top + 2 behind for depth
  const total = items.length;
  const position = topIdx + 1;

  function endDrag(dx: number) {
    startX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD) {
      setDragX(0);
      return;
    }
    const dir = dx > 0 ? "right" : "left";
    setFlyingOut(dir);
    // Animate out then advance
    window.setTimeout(() => {
      onDismiss(current.id);
      setFlyingOut(null);
      setDragX(0);
      setTopIdx((i) => i + 1);
    }, 180);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (flyingOut) return;
    startX.current = e.clientX;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (startX.current === null) return;
    setDragX(e.clientX - startX.current);
  }
  function onPointerUp() {
    if (startX.current === null) return;
    endDrag(dragX);
  }

  return (
    <section className={cn("space-y-2.5", className)}>
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <div
            className="h-8 w-8 rounded-[10px] flex items-center justify-center shadow-[0_2px_6px_rgba(15,74,38,0.25)]"
            style={{ background: "linear-gradient(135deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 72%, white) 100%)" }}
          >
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.4} />
          </div>
          <h2 className="text-[12px] font-black text-foreground uppercase tracking-[0.16em]">
            {t("urgency.deck.title", { defaultValue: "Insights" })}
          </h2>
          <span
            className="text-[10px] font-black h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full text-white tabular-nums shadow-[0_1px_3px_rgba(15,74,38,0.3)]"
            style={{ background: "linear-gradient(135deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 72%, white) 100%)" }}
          >
            {total}
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-foreground bg-card border-[1.5px] border-border rounded-full px-3 py-1.5 hover:border-primary hover:text-primary transition-colors"
        >
          <RefreshCw className="h-3 w-3" strokeWidth={2.6} />
          {t("common.refresh", { defaultValue: "Actualiser" })}
        </button>
      </div>

      {hasFailures && (
        <div className="flex items-start gap-2 rounded-[10px] border-[1.5px] border-[#fcd34d] bg-[#fffbeb] px-3 py-2 text-[11px] font-semibold text-[#92400e]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" strokeWidth={2.4} />
          <div className="space-y-0.5">
            <div>
              {t("urgency.partialError", {
                defaultValue:
                  "Certaines sources sont indisponibles, la liste peut être incomplète.",
              })}
            </div>
            <div className="font-mono text-[10px] opacity-80">
              debug: {failedSourcesDebug ?? "n/a"}
            </div>
          </div>
        </div>
      )}

      <div className="relative select-none" style={{ minHeight: 128 }}>
        {
          deck
            .map((item, i) => {
              const depth = i; // 0 = top
              const isTop = depth === 0;
              const busy = busyIds.has(item.id);
              const flying = isTop && flyingOut !== null;
              const restingTransform = `translateY(${depth * 8}px) scale(${1 - depth * 0.04})`;
              const dragTransform = flying
                ? `translateX(${flyingOut === "right" ? 400 : -400}px) rotate(${
                    flyingOut === "right" ? 18 : -18
                  }deg)`
                : isTop
                  ? `translateX(${dragX}px) rotate(${dragX * 0.04}deg)`
                  : restingTransform;
              const opacity = flying ? 0 : depth === 0 ? 1 : 0.55 - depth * 0.15;
              return (
                <div
                  key={item.id}
                  ref={isTop ? cardRef : null}
                  onPointerDown={isTop ? onPointerDown : undefined}
                  onPointerMove={isTop ? onPointerMove : undefined}
                  onPointerUp={isTop ? onPointerUp : undefined}
                  onPointerCancel={isTop ? onPointerUp : undefined}
                  className={cn(
                    "absolute inset-x-0 top-0 rounded-[16px] border-[1.5px] bg-card overflow-hidden shadow-[0_4px_14px_rgba(15,40,24,0.08)]",
                    SEV_RING[item.severity],
                    isTop
                      ? "touch-pan-y cursor-grab active:cursor-grabbing"
                      : "pointer-events-none",
                  )}
                  style={{
                    transform: dragTransform,
                    opacity,
                    zIndex: 30 - depth,
                    transition:
                      isTop && startX.current === null
                        ? "transform 180ms ease-out, opacity 180ms ease-out"
                        : undefined,
                  }}
                >
                  <div className="flex items-stretch">
                    <div className={cn("w-1.5 shrink-0", SEV_BAR[item.severity])} />
                    <div className="flex-1 min-w-0 p-3.5 flex items-start gap-3">
                      <div
                        className={cn(
                          "h-11 w-11 rounded-[12px] flex items-center justify-center shrink-0",
                          SEV_TILE[item.severity],
                        )}
                      >
                        <Clock className="h-5 w-5" strokeWidth={2.4} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span
                          className={cn(
                            "inline-block text-[10px] font-black uppercase tracking-[0.14em] px-2 py-0.5 rounded-md",
                            SEV_BADGE_CLASS[item.severity],
                          )}
                        >
                          {t(SEV_BADGE_LABEL[item.severity], {
                            defaultValue:
                              item.severity === "critical"
                                ? "Urgent"
                                : item.severity === "high"
                                  ? "Important"
                                  : "Info",
                          })}
                        </span>
                        <p className="mt-1.5 text-[14px] font-bold text-foreground leading-snug">
                          {item.title}
                        </p>
                        {item.subtitle && (
                          <p className="text-[11px] text-muted-foreground font-medium mt-0.5 line-clamp-1">
                            {item.subtitle}
                          </p>
                        )}
                        <div className="mt-2.5">
                          {item.quickRespondConvocationId ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Button
                                size="sm"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onQuickRespond(item, "present");
                                }}
                                disabled={busy || !isTop}
                                className="h-8 px-2.5 text-white border-0 shadow-[0_2px_6px_rgba(15,74,38,0.25)]"
                                style={{
                                  background: "linear-gradient(135deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 72%, white) 100%)",
                                }}
                              >
                                {busy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
                                )}
                                {t("attendance.present", { defaultValue: "Présent" })}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onQuickRespond(item, "uncertain");
                                }}
                                disabled={busy || !isTop}
                                className="h-8 px-2.5 border-[1.5px]"
                              >
                                <HelpCircle className="h-3.5 w-3.5" strokeWidth={2.4} />
                                {t("attendance.uncertain", { defaultValue: "Incertain" })}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onQuickRespond(item, "absent");
                                }}
                                disabled={busy || !isTop}
                                className="h-8 px-2.5 border-[1.5px] text-[#b91c1c] hover:text-[#b91c1c]"
                              >
                                <XCircle className="h-3.5 w-3.5" strokeWidth={2.4} />
                                {t("attendance.absent", { defaultValue: "Absent" })}
                              </Button>
                            </div>
                          ) : item.primaryAction.kind === "open-need" ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Button
                                size="sm"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNeedRespond(item, "available");
                                }}
                                disabled={busy || !isTop}
                                className="h-8 px-2.5 text-white border-0 shadow-[0_2px_6px_rgba(15,74,38,0.25)]"
                                style={{
                                  background: "linear-gradient(135deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 72%, white) 100%)",
                                }}
                              >
                                {busy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <ThumbsUp className="h-3.5 w-3.5" strokeWidth={2.6} />
                                )}
                                {t("needs:insight.available", { defaultValue: "Dispo" })}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNeedRespond(item, "unavailable");
                                }}
                                disabled={busy || !isTop}
                                className="h-8 px-2.5 border-[1.5px] text-[#b91c1c] hover:text-[#b91c1c]"
                              >
                                <ThumbsDown className="h-3.5 w-3.5" strokeWidth={2.4} />
                                {t("needs:insight.unavailable", { defaultValue: "Pas dispo" })}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAction(item);
                                }}
                                disabled={busy || !isTop}
                                className="h-8 px-2 text-[11px]"
                              >
                                {t("urgency.cta.open", { defaultValue: "Ouvrir" })}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onAction(item);
                              }}
                              onPointerDown={(e) => e.stopPropagation()}
                              disabled={busy || !isTop}
                              className="text-white shadow-[0_2px_6px_rgba(15,74,38,0.25)] border-0"
                              style={{
                                background: "linear-gradient(135deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 72%, white) 100%)",
                              }}
                            >
                              {busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ActionIcon kind={item.primaryAction.kind} />
                              )}
                              {item.primaryAction.kind === "remind-all"
                                ? t("attendance.remindAll", { defaultValue: "Envoyer un rappel" })
                                : item.primaryAction.kind === "respond"
                                  ? t("urgency.cta.respond", { defaultValue: "Répondre" })
                                  : item.primaryAction.kind === "open-team-availability"
                                    ? t("urgency.cta.openCalendar", {
                                        defaultValue: "Voir le calendrier",
                                      })
                                    : t("urgency.cta.open", { defaultValue: "Ouvrir" })}
                            </Button>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDismiss(item.id);
                          toast.success(
                            t("urgency.dismissed", { defaultValue: "Carte masquée pour 24 h" }),
                          );
                          setTopIdx((idx) => idx + 1);
                        }}
                        aria-label={t("common.dismiss", { defaultValue: "Masquer" })}
                        className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <X className="h-4 w-4" strokeWidth={2.4} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
            .reverse() /* render deepest first so top card wins stacking */
        }
      </div>
      {total > 1 && (
        <p className="text-center text-[10px] font-semibold text-muted-foreground">
          {position}/{total} · {t("urgency.deck.hint", { defaultValue: "Swipe pour passer" })}
        </p>
      )}
      {footer}
    </section>
  );
}
