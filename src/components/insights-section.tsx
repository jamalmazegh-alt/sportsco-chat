import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Clock, UserX, Trophy, Shield, X, Sparkles, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { dismissInsight } from "@/lib/insights.functions";
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
  { iconFg: string; dot: string; hoverBg: string }
> = {
  high: {
    iconFg: "text-destructive",
    dot: "bg-destructive",
    hoverBg: "hover:bg-destructive/5",
  },
  medium: {
    iconFg: "text-pending",
    dot: "bg-pending",
    hoverBg: "hover:bg-pending/5",
  },
  low: {
    iconFg: "text-primary",
    dot: "bg-primary",
    hoverBg: "hover:bg-primary/5",
  },
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
    <section className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.14em]">
          {t("insights.title")}
        </h2>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          {insights.length}
        </span>
      </div>
      <div className="space-y-1">
        {insights.map((ins) => {
          const Icon = TYPE_ICON[ins.insight_type] ?? Clock;
          const msg = locale === "en" ? ins.message_en : ins.message_fr;
          const label = actionLabel(ins.action_type);
          const tone = PRIORITY_TONE[ins.priority];
          return (
            <div
              key={ins.id}
              className={cn(
                "group flex items-start gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2 transition-colors",
                tone.hoverBg,
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", tone.iconFg)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-foreground">{msg}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                {label && (
                  <button
                    className="text-xs text-primary hover:underline underline-offset-2 font-medium"
                    onClick={() => handleAction(ins)}
                  >
                    {label}
                  </button>
                )}
                <button
                  aria-label={t("insights.dismiss")}
                  onClick={() => setPendingDismiss(ins.id)}
                  className="p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3 w-3" />
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
