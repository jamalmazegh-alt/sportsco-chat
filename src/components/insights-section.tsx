import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Clock, UserX, Trophy, Shield, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dismissInsight } from "@/lib/insights.functions";
import { toast } from "sonner";

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

const PRIORITY_BORDER: Record<InsightRow["priority"], string> = {
  high: "border-l-destructive",
  medium: "border-l-pending",
  low: "border-l-primary",
};

export function InsightsSection({ clubId }: { clubId: string }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const locale = (i18n.language?.startsWith("en") ? "en" : "fr") as "fr" | "en";

  const { data: insights } = useQuery({
    queryKey: ["coach-insights", clubId, user?.id],
    enabled: !!clubId && !!user,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("coach_insights" as any)
        .select(
          "id, club_id, insight_type, message_fr, message_en, priority, action_type, action_payload, dismissed_by, resolved_at, expires_at",
        )
        .eq("club_id", clubId)
        .is("resolved_at", null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as unknown as InsightRow[];
      return list.filter((i) => !(i.dismissed_by ?? []).includes(user!.id));
    },
  });

  if (!insights || insights.length === 0) return null;

  const handleAction = (ins: InsightRow) => {
    const ap = (ins.action_payload ?? {}) as { event_id?: string; player_id?: string };
    if (ins.action_type === "send_reminder" && ap.event_id) {
      navigate({ to: "/events/$eventId", params: { eventId: ap.event_id } });
    } else if (ins.action_type === "view_event" && ap.event_id) {
      navigate({ to: "/events/$eventId", params: { eventId: ap.event_id } });
    } else if (ins.action_type === "view_player" && ap.player_id) {
      navigate({ to: "/players/$playerId", params: { playerId: ap.player_id } });
    }
  };

  const handleDismiss = async (id: string) => {
    // Optimistic
    qc.setQueryData<InsightRow[] | undefined>(
      ["coach-insights", clubId, user?.id],
      (old) => old?.filter((i) => i.id !== id),
    );
    try {
      await dismissInsight({ data: { insightId: id } });
    } catch {
      toast.error("Error");
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
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t("insights.title")}
        </h2>
      </div>
      <div className="flex gap-3 overflow-x-auto sm:overflow-visible sm:flex-col sm:gap-2 -mx-5 px-5 sm:mx-0 sm:px-0 snap-x snap-mandatory">
        {insights.map((ins) => {
          const Icon = TYPE_ICON[ins.insight_type] ?? Clock;
          const msg = locale === "en" ? ins.message_en : ins.message_fr;
          const label = actionLabel(ins.action_type);
          return (
            <div
              key={ins.id}
              className={cn(
                "relative shrink-0 snap-start w-[85%] sm:w-auto rounded-2xl border bg-card p-4 border-l-4",
                PRIORITY_BORDER[ins.priority],
              )}
            >
              <button
                aria-label={t("insights.dismiss")}
                onClick={() => handleDismiss(ins.id)}
                className="absolute top-2 right-2 p-1 rounded-md hover:bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-start gap-3 pr-6">
                <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t(`insights.${ins.priority}`)}
                  </p>
                  <p className="text-sm mt-0.5 leading-snug">{msg}</p>
                  {label && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3 h-8"
                      onClick={() => handleAction(ins)}
                    >
                      {label}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
