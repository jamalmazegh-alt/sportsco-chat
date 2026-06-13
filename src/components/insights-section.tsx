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
  { iconBg: string; iconFg: string; accent: string; ring: string; label: string }
> = {
  high: {
    iconBg: "bg-destructive/10",
    iconFg: "text-destructive",
    accent: "before:bg-destructive",
    ring: "ring-destructive/15",
    label: "text-destructive",
  },
  medium: {
    iconBg: "bg-pending/10",
    iconFg: "text-pending",
    accent: "before:bg-pending",
    ring: "ring-pending/15",
    label: "text-pending",
  },
  low: {
    iconBg: "bg-primary/10",
    iconFg: "text-primary",
    accent: "before:bg-primary",
    ring: "ring-primary/15",
    label: "text-primary",
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
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-[0.14em]">
            {t("insights.title")}
          </h2>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary tabular-nums">
          {insights.length}
        </span>
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
              className={cn(
                "group relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-all",
                "hover:shadow-md hover:border-border",
                "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1",
                tone.accent,
              )}
            >
              <div className="flex items-start gap-3 pl-4 pr-2.5 py-3">
                <div
                  className={cn(
                    "h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ring-1",
                    tone.iconBg,
                    tone.ring,
                  )}
                >
                  <Icon className={cn("h-4 w-4", tone.iconFg)} />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-wider mb-0.5",
                      tone.label,
                    )}
                  >
                    {priorityLabel}
                  </p>
                  <p className="text-sm leading-snug text-foreground">{msg}</p>
                  {label && (
                    <button
                      onClick={() => handleAction(ins)}
                      className={cn(
                        "mt-2 inline-flex items-center gap-0.5 text-xs font-semibold rounded-md px-2 py-1 -ml-2 transition-colors",
                        "text-primary hover:bg-primary/10",
                      )}
                    >
                      {label}
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <button
                  aria-label={t("insights.dismiss")}
                  onClick={() => setPendingDismiss(ins.id)}
                  className="shrink-0 p-1.5 rounded-md text-muted-foreground/60 transition-all hover:bg-muted hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
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
