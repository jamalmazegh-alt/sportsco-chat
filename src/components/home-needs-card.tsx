import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { ChevronRight, HandHelping, Check, X } from "lucide-react";
import { listMyOpenNeeds, applyToEventNeed, withdrawSignup } from "@/lib/needs/needs.functions";
import { getNeedVisual, resolveNeedLabel } from "@/components/needs/need-visuals";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmt } from "@/lib/date-locale";
import { toast } from "sonner";

export function HomeNeedsCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const listFn = useServerFn(listMyOpenNeeds);
  const applyFn = useServerFn(applyToEventNeed);
  const withdrawFn = useServerFn(withdrawSignup);

  const { data } = useQuery({
    queryKey: ["home-my-open-needs"],
    queryFn: () => listFn({ data: {} }),
    staleTime: 30_000,
  });

  const applyMut = useMutation({
    mutationFn: (need_id: string) => applyFn({ data: { need_id } }),
    onSuccess: () => {
      toast.success(t("needs:signup.applied"));
      qc.invalidateQueries({ queryKey: ["home-my-open-needs"] });
      qc.invalidateQueries({ queryKey: ["my-open-needs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const withdrawMut = useMutation({
    mutationFn: (signup_id: string) => withdrawFn({ data: { signup_id } }),
    onSuccess: () => {
      toast.success(t("needs:signup.withdrawn"));
      qc.invalidateQueries({ queryKey: ["home-my-open-needs"] });
      qc.invalidateQueries({ queryKey: ["my-open-needs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const needs = (data?.needs ?? []) as any[];
  // Prioritize needs where user hasn't decided yet
  const sorted = [...needs].sort((a, b) => {
    const aPending = !a.my_signup ? 0 : 1;
    const bPending = !b.my_signup ? 0 : 1;
    return aPending - bPending;
  });
  const visible = sorted.slice(0, 3);

  if (needs.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <h2 className="text-[11px] font-bold text-foreground uppercase tracking-[0.14em] inline-flex items-center gap-1.5">
          <HandHelping className="h-3.5 w-3.5 text-primary" strokeWidth={2.4} />
          {t("needs:feed.title", { defaultValue: "Coups de main" })}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
            {needs.length}
          </Badge>
        </h2>
        <Link
          to="/needs"
          className="text-[11px] text-foreground font-bold inline-flex items-center gap-0.5 hover:text-[#2d9d5f] transition-colors"
        >
          {t("common.seeAll", { defaultValue: "Tout voir" })}
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="space-y-2">
        {visible.map((n) => {
          const visual = getNeedVisual(n.role_key);
          const Icon = visual.Icon;
          const label = resolveNeedLabel(n, t);
          const applied = n.my_signup?.status === "applied";
          const confirmed = n.my_signup?.status === "confirmed";
          const canApply = !n.my_signup && n.remaining_seats > 0;

          return (
            <div
              key={n.id}
              className="rounded-[12px] border-[1.5px] border-border bg-card p-3 flex items-center gap-3"
            >
              <div
                className={`h-9 w-9 rounded-[10px] flex items-center justify-center shrink-0 ${visual.chip}`}
              >
                <Icon className="h-4 w-4" strokeWidth={2.4} />
              </div>
              <Link
                to="/events/$eventId"
                params={{ eventId: n.event_id }}
                className="min-w-0 flex-1"
              >
                <p className="text-[13px] font-bold leading-tight truncate">{label}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {n.events?.title}
                  {n.events?.starts_at && (
                    <span className="ml-1">· {fmt(n.events.starts_at, "d MMM · HH:mm")}</span>
                  )}
                </p>
              </Link>
              <div className="flex items-center gap-1.5 shrink-0">
                {confirmed && (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 text-[10px] font-bold border-0">
                    <Check className="h-3 w-3 mr-0.5" strokeWidth={2.6} />
                    {t("needs:signup.confirmed")}
                  </Badge>
                )}
                {applied && (
                  <>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold border-amber-300 text-amber-800 dark:text-amber-300"
                    >
                      {t("needs:signup.applied")}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      disabled={withdrawMut.isPending}
                      onClick={(e) => {
                        e.preventDefault();
                        withdrawMut.mutate(n.my_signup.id);
                      }}
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2.6} />
                    </Button>
                  </>
                )}
                {canApply && (
                  <Button
                    size="sm"
                    className="h-7 px-2.5 text-[11px] font-bold"
                    disabled={applyMut.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      applyMut.mutate(n.id);
                    }}
                  >
                    {t("needs:actions.apply")}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
