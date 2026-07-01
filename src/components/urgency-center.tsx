import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useUrgencies } from "@/lib/urgency/use-urgencies";
import { dispatchUrgencyAction } from "@/lib/urgency/dispatcher";
import { selectSurfaceState } from "@/lib/urgency/pure";
import { remindAllForEvent } from "@/lib/urgency/remind";
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
  critical: "border-[#dc2626]",
  high: "border-[#f59e0b]",
  medium: "border-[#fcd34d]",
};

const SEV_TILE: Record<UrgencySeverity, string> = {
  critical: "bg-[#fef2f2] text-[#dc2626]",
  high: "bg-[#fffbeb] text-[#92400e]",
  medium: "bg-[#fefce8] text-[#854d0e]",
};

function ActionIcon({ kind }: { kind: UrgencyAction["kind"] }) {
  if (kind === "remind-all" || kind === "remind-one")
    return <BellRing className="h-3.5 w-3.5" strokeWidth={2.4} />;
  if (kind === "respond") return <Bell className="h-3.5 w-3.5" strokeWidth={2.4} />;
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

  if (surface === "pending") {
    return (
      <section className={cn("space-y-2", className)}>
        <Skeleton className="h-20 w-full rounded-[16px]" />
        <Skeleton className="h-16 w-full rounded-[16px]" />
      </section>
    );
  }

  if (surface === "error") {
    return (
      <section
        className={cn("rounded-[16px] border-[1.5px] border-[#fecaca] bg-[#fef2f2] p-4", className)}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[#dc2626] shrink-0 mt-0.5" strokeWidth={2.4} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-[#7f1d1d]">
              {t("urgency.error.title", { defaultValue: "Centre d'urgence indisponible" })}
            </p>
            <p className="text-[11px] text-[#991b1b] mt-0.5">
              {t("urgency.error.hint", {
                defaultValue: "Impossible de charger les signaux. Réessaie dans un instant.",
              })}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["urgency"], exact: false })}
          >
            {t("common.retry", { defaultValue: "Réessayer" })}
          </Button>
        </div>
      </section>
    );
  }

  if (surface === "empty") {
    return (
      <section
        className={cn(
          "relative overflow-hidden rounded-[16px] border-[1.5px] border-border bg-card p-4",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-[12px] bg-[#f0f9f3] ring-1 ring-[#bbf7d0] flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-[#2d9d5f]" strokeWidth={2.4} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-foreground leading-tight">
              {t("urgency.empty.title", { defaultValue: "Tout est sous contrôle" })}
            </h2>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground mt-0.5">
              {t("urgency.empty.subtitle", { defaultValue: "Aucune action urgente" })}
            </p>
          </div>
        </div>
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

  return (
    <UrgencyDeck
      items={items}
      hasFailures={hasFailures}
      busyIds={busyIds}
      onAction={handleAction}
      onDismiss={(id) => {
        dismissItem(id);
      }}
      className={className}
    />
  );
}

interface DeckProps {
  items: UrgencyItem[];
  hasFailures: boolean;
  busyIds: Set<string>;
  onAction: (item: UrgencyItem) => void | Promise<void>;
  onDismiss: (id: string) => void;
  className?: string;
}

const SWIPE_THRESHOLD = 90; // px

function UrgencyDeck({ items, hasFailures, busyIds, onAction, onDismiss, className }: DeckProps) {
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
            className="h-7 w-7 rounded-[8px] flex items-center justify-center shadow-[0_2px_6px_rgba(220,38,38,0.25)]"
            style={{ background: "linear-gradient(135deg, #b91c1c 0%, #f59e0b 100%)" }}
          >
            <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2.4} />
          </div>
          <h2 className="text-[11px] font-bold text-foreground uppercase tracking-[0.14em]">
            {t("urgency.deck.title", { defaultValue: "Insights urgents" })}
          </h2>
          <span
            className="text-[10px] font-black px-2 py-0.5 rounded-full text-white tabular-nums shadow-[0_1px_3px_rgba(220,38,38,0.3)]"
            style={{ background: "linear-gradient(135deg, #b91c1c 0%, #f59e0b 100%)" }}
          >
            {position}/{total}
          </span>
        </div>
        <span className="text-[10px] font-semibold text-muted-foreground">
          {t("urgency.deck.hint", { defaultValue: "Swipe pour passer" })}
        </span>
      </div>

      {hasFailures && (
        <div className="flex items-center gap-2 rounded-[10px] border-[1.5px] border-[#fcd34d] bg-[#fffbeb] px-3 py-2 text-[11px] font-semibold text-[#92400e]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
          {t("urgency.partialError", {
            defaultValue: "Certaines sources sont indisponibles, la liste peut être incomplète.",
          })}
        </div>
      )}

      <div className="relative select-none" style={{ height: 96 }}>
        {deck
          .map((item, i) => {
            const depth = i; // 0 = top
            const isTop = depth === 0;
            const busy = busyIds.has(item.id);
            const flying = isTop && flyingOut !== null;
            const restingTransform = `translateY(${depth * 8}px) scale(${1 - depth * 0.05})`;
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
                  "absolute inset-x-0 top-0 rounded-[14px] border-[1.5px] bg-card p-3 flex items-center gap-3 shadow-[0_2px_8px_rgba(15,40,24,0.06)]",
                  SEV_RING[item.severity],
                  isTop ? "touch-pan-y cursor-grab active:cursor-grabbing" : "pointer-events-none",
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
                <div
                  className={cn(
                    "h-10 w-10 rounded-[12px] flex items-center justify-center shrink-0",
                    SEV_TILE[item.severity],
                  )}
                >
                  <Users className="h-5 w-5" strokeWidth={2.4} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-foreground truncate">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground font-medium truncate">
                    {item.subtitle}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction(item);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={busy || !isTop}
                  className="shrink-0"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ActionIcon kind={item.primaryAction.kind} />
                  )}
                  {item.primaryAction.kind === "remind-all"
                    ? t("attendance.remindAll", { defaultValue: "Tout relancer" })
                    : item.primaryAction.kind === "respond"
                      ? t("urgency.cta.respond", { defaultValue: "Répondre" })
                      : t("urgency.cta.open", { defaultValue: "Ouvrir" })}
                </Button>
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
                  <X className="h-3.5 w-3.5" strokeWidth={2.4} />
                </button>
              </div>
            );
          })
          .reverse() /* render deepest first so top card wins stacking */}
      </div>
    </section>
  );
}

