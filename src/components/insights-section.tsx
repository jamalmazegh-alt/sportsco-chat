import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { Clock, UserX, Trophy, Shield, X, Sparkles, ChevronRight, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { dismissInsight } from "@/lib/insights.functions";
import { refreshCoachInsights } from "@/lib/llm/coach-insights.functions";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type InsightRow = {
  id: string;
  club_id: string;
  insight_type:
    | "pending_convocations"
    | "consecutive_absences"
    | "missing_score"
    | "missing_guardian";
  message_fr: string;
  message_en: string;
  priority: "high" | "medium" | "low";
  action_type: "send_reminder" | "view_event" | "view_player" | null;
  action_payload: Record<string, unknown> | null;
  dismissed_by: string[] | null;
  resolved_at: string | null;
  expires_at: string | null;
};

const TYPE_ICON = {
  pending_convocations: Clock,
  consecutive_absences: UserX,
  missing_score: Trophy,
  missing_guardian: Shield,
} as const;

const PRIORITY_TONE: Record<
  InsightRow["priority"],
  {
    bar: string;
    iconBg: string;
    iconColor: string;
    chipBg: string;
    chipColor: string;
    label: string;
  }
> = {
  high: {
    bar: "linear-gradient(180deg, #dc2626 0%, #f87171 100%)",
    iconBg: "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)",
    iconColor: "#b91c1c",
    chipBg: "#fee2e2",
    chipColor: "#b91c1c",
    label: "text-[#b91c1c]",
  },
  medium: {
    bar: "linear-gradient(180deg, #b45309 0%, #f59e0b 100%)",
    iconBg: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
    iconColor: "#92400e",
    chipBg: "#fef3c7",
    chipColor: "#92400e",
    label: "text-[#92400e]",
  },
  low: {
    bar: "linear-gradient(180deg, #0f4a26 0%, #2d9d5f 100%)",
    iconBg: "linear-gradient(135deg, #d4ead9 0%, #b8dcc4 100%)",
    iconColor: "#0f4a26",
    chipBg: "#d4ead9",
    chipColor: "#0f4a26",
    label: "text-[#0f4a26]",
  },
};

const PRIORITY_LABEL_KEY: Record<InsightRow["priority"], string> = {
  high: "insights.high",
  medium: "insights.medium",
  low: "insights.low",
};

export function InsightsSection({ clubId }: { clubId: string }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const locale = (i18n.language?.startsWith("en") ? "en" : "fr") as "fr" | "en";
  const [pendingDismiss, setPendingDismiss] = useState<string | null>(null);

  const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

  const { data: insights } = useQuery({
    queryKey: ["coach-insights", clubId, user?.id],
    enabled: !!clubId && !!user,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("coach_insights")
        .select(
          "id, club_id, insight_type, message_fr, message_en, priority, action_type, action_payload, dismissed_by, resolved_at, expires_at",
        )
        .eq("club_id", clubId)
        .is("resolved_at", null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as unknown as InsightRow[];
      return list
        .filter((i) => !(i.dismissed_by ?? []).includes(user!.id))
        .sort(
          (a, b) =>
            (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99),
        );
    },
  });

  const REFRESH_KEY = `coach-insights-last-refresh:${clubId}`;
  const [lastRefreshAt, setLastRefreshAt] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(window.localStorage.getItem(REFRESH_KEY) ?? 0);
  });
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const cooldownRemainingMs = Math.max(0, lastRefreshAt + 24 * 3600 * 1000 - now);
  const cooldownActive = cooldownRemainingMs > 0;

  const refreshMutation = useMutation({
    mutationFn: () => refreshCoachInsights({ data: { clubId } }),
    onSuccess: (res) => {
      if (res?.ok) {
        const ts = Date.now();
        setLastRefreshAt(ts);
        try {
          window.localStorage.setItem(REFRESH_KEY, String(ts));
        } catch {
          /* ignore */
        }
        toast.success(t("coachInsightsAi.refreshDone", { ns: "tournaments" }));
        qc.invalidateQueries({ queryKey: ["coach-insights", clubId, user?.id] });
      } else if (res?.reason === "rate_limited") {
        // Server says we already used today's quota — sync local cooldown.
        const ts = Date.now();
        setLastRefreshAt(ts);
        try {
          window.localStorage.setItem(REFRESH_KEY, String(ts));
        } catch {
          /* ignore */
        }
        toast.error(t("coachInsightsAi.refreshLimited", { ns: "tournaments" }));
      } else {
        toast.error(t("coachInsightsAi.refreshError", { ns: "tournaments" }));
      }
    },
    onError: () => {
      toast.error(t("coachInsightsAi.refreshError", { ns: "tournaments" }));
    },
  });

  const refreshDisabled = refreshMutation.isPending || cooldownActive;

  if (!insights || insights.length === 0) return null;

  const handleAction = (ins: InsightRow) => {
    const ap = (ins.action_payload ?? {}) as { event_id?: string; player_id?: string };
    if (ins.action_type === "send_reminder" && ap.event_id) {
      navigate({
        to: "/events/$eventId",
        params: { eventId: ap.event_id },
        search: { action: "remind" },
      });
    } else if (ins.action_type === "view_event" && ap.event_id) {
      navigate({ to: "/events/$eventId", params: { eventId: ap.event_id } });
    } else if (ins.action_type === "view_player" && ap.player_id) {
      navigate({ to: "/players/$playerId", params: { playerId: ap.player_id } });
    }
  };

  const confirmDismiss = async () => {
    const id = pendingDismiss;
    if (!id) return;
    setPendingDismiss(null);
    qc.setQueryData<InsightRow[] | undefined>(
      ["coach-insights", clubId, user?.id],
      (old) => old?.filter((i) => i.id !== id),
    );
    try {
      await dismissInsight({ data: { insightId: id } });
    } catch {
      toast.error(t("errors.generic"));
      qc.invalidateQueries({ queryKey: ["coach-insights", clubId, user?.id] });
    }
  };

  const actionLabel = (a: InsightRow["action_type"]) => {
    if (a === "send_reminder") return t("insights.sendReminder");
    if (a === "view_event") return t("insights.viewEvent");
    if (a === "view_player") return t("insights.viewPlayer");
    return null;
  };

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <div
            className="h-7 w-7 rounded-[8px] flex items-center justify-center shadow-[0_2px_6px_rgba(15,74,38,0.2)]"
            style={{ background: "linear-gradient(135deg, #0f4a26 0%, #2d9d5f 100%)" }}
          >
            <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2.4} />
          </div>
          <h2 className="text-[11px] font-bold text-[#0f2818] uppercase tracking-[0.14em]">
            {t("insights.title")}
          </h2>
          <span
            className="text-[10px] font-black px-2 py-0.5 rounded-full text-white tabular-nums shadow-[0_1px_3px_rgba(15,74,38,0.25)]"
            style={{ background: "linear-gradient(135deg, #0f4a26 0%, #2d9d5f 100%)" }}
          >
            {insights.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshDisabled}
          title={
            cooldownActive
              ? t("coachInsightsAi.refreshLimited", { ns: "tournaments" })
              : t("coachInsightsAi.refresh", { ns: "tournaments" })
          }
          aria-label={t("coachInsightsAi.refresh", { ns: "tournaments" })}
          className={cn(
            "inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full transition-all",
            "bg-white border-[1.5px] border-[#e2e8f0] text-[#0f4a26] hover:border-[#2d9d5f] hover:bg-[#f0f9f3]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <RefreshCw
            className={cn("h-3 w-3", refreshMutation.isPending && "animate-spin")}
            strokeWidth={2.4}
          />
          <span>
            {refreshMutation.isPending
              ? t("coachInsightsAi.refreshing", { ns: "tournaments" })
              : t("coachInsightsAi.refresh", { ns: "tournaments" })}
          </span>
        </button>
      </div>
      <div className="space-y-2">
        {insights.map((ins) => {
          const Icon = TYPE_ICON[ins.insight_type] ?? Clock;
          const msg = locale === "en" ? ins.message_en : ins.message_fr;
          const label = actionLabel(ins.action_type);
          const tone = PRIORITY_TONE[ins.priority];
          const priorityLabel = t(PRIORITY_LABEL_KEY[ins.priority], {
            defaultValue: ins.priority,
          });
          return (
            <div
              key={ins.id}
              className="group relative overflow-hidden rounded-[14px] border-[1.5px] border-[#e2e8f0] bg-white shadow-[0_1px_2px_rgba(15,40,24,0.04)] transition-all hover:shadow-[0_4px_12px_rgba(15,40,24,0.08)] hover:border-[#cbd5e1]"
            >
              <div
                aria-hidden
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ background: tone.bar }}
              />
              <div className="flex items-start gap-3 pl-4 pr-2 py-3">
                <div
                  className="h-10 w-10 shrink-0 rounded-[10px] flex items-center justify-center"
                  style={{ background: tone.iconBg }}
                >
                  <Icon className="h-4 w-4" style={{ color: tone.iconColor }} strokeWidth={2.4} />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <span
                    className="inline-block text-[9px] font-black uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-[4px] mb-1"
                    style={{ background: tone.chipBg, color: tone.chipColor }}
                  >
                    {priorityLabel}
                  </span>
                  <p className="text-[13px] leading-snug text-[#0f2818] font-medium">{msg}</p>
                  {label && (
                    <button
                      onClick={() => handleAction(ins)}
                      className="mt-2 inline-flex items-center gap-0.5 text-[11px] font-bold rounded-[8px] px-2.5 py-1.5 -ml-1 text-white transition-all hover:shadow-[0_2px_6px_rgba(15,74,38,0.25)] active:scale-95"
                      style={{
                        background: "linear-gradient(135deg, #0f4a26 0%, #2d9d5f 100%)",
                      }}
                    >
                      {label}
                      <ChevronRight className="h-3 w-3" strokeWidth={2.6} />
                    </button>
                  )}
                </div>
                <button
                  aria-label={t("insights.dismiss")}
                  onClick={() => setPendingDismiss(ins.id)}
                  className="shrink-0 p-1.5 rounded-md text-[#94a3b8] transition-all hover:bg-[#f1f5f9] hover:text-[#0f2818] sm:opacity-40 sm:group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.4} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={!!pendingDismiss}
        onOpenChange={(o) => !o && setPendingDismiss(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("insights.dismissConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("insights.dismissConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDismiss}>
              {t("insights.dismissConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
