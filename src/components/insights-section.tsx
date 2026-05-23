import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Clock, UserX, Trophy, Shield, X, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
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
  { ring: string; iconBg: string; iconFg: string; badge: string; accent: string }
> = {
  high: {
    ring: "ring-destructive/20",
    iconBg: "bg-destructive/10",
    iconFg: "text-destructive",
    badge: "bg-destructive/10 text-destructive",
    accent: "before:bg-destructive",
  },
  medium: {
    ring: "ring-pending/20",
    iconBg: "bg-pending/10",
    iconFg: "text-pending",
    badge: "bg-pending/10 text-pending",
    accent: "before:bg-pending",
  },
  low: {
    ring: "ring-primary/15",
    iconBg: "bg-primary/10",
    iconFg: "text-primary",
    badge: "bg-primary/10 text-primary",
    accent: "before:bg-primary",
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
    <section className="space-y-3">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.14em]">
          {t("insights.title")}
        </h2>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          {insights.length}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto sm:overflow-visible sm:flex-col sm:gap-2.5 -mx-5 px-5 sm:mx-0 sm:px-0 snap-x snap-mandatory pb-1">
        {insights.map((ins) => {
          const Icon = TYPE_ICON[ins.insight_type] ?? Clock;
          const msg = locale === "en" ? ins.message_en : ins.message_fr;
          const label = actionLabel(ins.action_type);
          const tone = PRIORITY_TONE[ins.priority];
          return (
            <div
              key={ins.id}
              className={cn(
                "relative shrink-0 snap-start w-[85%] sm:w-auto overflow-hidden rounded-2xl bg-card p-4 pl-5 ring-1 shadow-sm transition-shadow hover:shadow-md",
                "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1",
                tone.ring,
                tone.accent,
              )}
            >
              <button
                aria-label={t("insights.dismiss")}
                onClick={() => setPendingDismiss(ins.id)}
                className="absolute top-2.5 right-2.5 p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-start gap-3 pr-6">
                <div
                  className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                    tone.iconBg,
                  )}
                >
                  <Icon className={cn("h-5 w-5", tone.iconFg)} />
                </div>
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                      tone.badge,
                    )}
                  >
                    {t(`insights.${ins.priority}`)}
                  </span>
                  <p className="text-sm mt-2 leading-snug text-foreground">{msg}</p>
                  {label && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 h-8 px-2 -ml-2 text-primary hover:text-primary hover:bg-primary/10"
                      onClick={() => handleAction(ins)}
                    >
                      {label}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
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
