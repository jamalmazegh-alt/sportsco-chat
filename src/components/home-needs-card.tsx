import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ChevronRight, HandHelping } from "lucide-react";
import { listMyOpenNeeds, withdrawSignup } from "@/lib/needs/needs.functions";
import { NeedCandidateCard } from "@/components/needs/need-candidate-card";
import { severityForStart } from "@/lib/urgency/pure";
import { fmt } from "@/lib/date-locale";
import { resolveNeedLabel } from "@/components/needs/need-visuals";
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
import { toast } from "sonner";

/**
 * Sépare les engagements « imminents » (< 48 h) des autres.
 * Réutilise `severityForStart` en surchargeant le seuil critical à 48 h.
 * Un engagement est imminent ssi la sévérité vaut `critical` (delta > 0 et < 48 h).
 * Exporté pour les tests unitaires.
 */
export function isImminentEngagement(
  startsAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!startsAt) return false;
  return severityForStart(startsAt, now, { criticalHours: 48, highHours: 48 }) === "critical";
}

export function HomeNeedsCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const listFn = useServerFn(listMyOpenNeeds);
  const withdrawFn = useServerFn(withdrawSignup);

  const { data } = useQuery({
    queryKey: ["home-my-open-needs"],
    queryFn: () => listFn({ data: {} }),
    staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["home-my-open-needs"] });
    qc.invalidateQueries({ queryKey: ["my-open-needs"] });
  };

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState<{
    signupId: string;
    needLabel: string;
    eventLabel: string;
  } | null>(null);

  const withdrawMut = useMutation({
    mutationFn: (signup_id: string) => withdrawFn({ data: { signup_id } }),
    onSuccess: () => {
      toast.success(t("needs:signup.withdrawn"));
      invalidate();
    },
    onError: (e: Error) => toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });

  const allNeeds = (data?.needs ?? []) as any[];

  const hasActiveSignup = (n: any) =>
    n.my_signup &&
    n.my_signup.status !== "withdrawn" &&
    n.my_signup.status !== "declined" &&
    n.my_signup.status !== "unavailable";

  // Engagements en cours uniquement, triés par date d'événement (le plus proche d'abord).
  const engagements = allNeeds
    .filter(hasActiveSignup)
    .slice()
    .sort((a, b) => {
      const ta = a.events?.starts_at
        ? new Date(a.events.starts_at).getTime()
        : Number.POSITIVE_INFINITY;
      const tb = b.events?.starts_at
        ? new Date(b.events.starts_at).getTime()
        : Number.POSITIVE_INFINITY;
      return ta - tb;
    });

  if (engagements.length === 0) return null;

  const now = new Date();
  const firstIsImminent = isImminentEngagement(engagements[0]?.events?.starts_at, now);
  const imminent = firstIsImminent ? engagements[0] : null;
  const others = firstIsImminent ? engagements.slice(1) : engagements;

  const next = others[0] ?? null;
  const nextLabel = next ? resolveNeedLabel(next, t) : null;

  const openWithdrawConfirm = (need: any) => {
    if (!need?.my_signup) return;
    setConfirmWithdraw({
      signupId: need.my_signup.id,
      needLabel: resolveNeedLabel(need, t),
      eventLabel: need.events?.title ?? "",
    });
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <h2 className="text-[11px] font-bold text-foreground uppercase tracking-[0.14em] inline-flex items-center gap-1.5">
          <HandHelping className="h-3.5 w-3.5 text-primary" strokeWidth={2.4} />
          {t("needs:myFeed.title")}
          <span className="text-muted-foreground font-semibold normal-case tracking-normal">
            · {t("needs:myFeed.engagementsCount", { count: engagements.length })}
          </span>
        </h2>
      </div>

      {imminent && (
        <div className="mb-2">
          <NeedCandidateCard
            need={imminent}
            onWithdraw={() => openWithdrawConfirm(imminent)}
            withdrawPending={pendingId === imminent.id && withdrawMut.isPending}
          />
        </div>
      )}

      {others.length > 0 && (
        <Link
          to="/needs"
          className="flex items-center justify-between gap-2 rounded-[12px] border-[1.5px] border-border bg-card px-3 py-2.5 hover:bg-muted/40 transition-colors"
        >
          <div className="min-w-0 flex-1">
            {next && (
              <p className="text-[12px] text-foreground truncate">
                <span className="font-semibold">{t("needs:myFeed.nextLabel")} : </span>
                <span>{nextLabel}</span>
                {next.events?.title && <span> — {next.events.title}</span>}
                {next.events?.starts_at && (
                  <span className="text-muted-foreground">
                    , {fmt(next.events.starts_at, "d MMM · HH:mm")}
                  </span>
                )}
              </p>
            )}
            {others.length > 1 && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("needs:myFeed.plusOthers", { count: others.length - 1 })}
              </p>
            )}
          </div>
          <span className="text-[11px] font-bold text-foreground inline-flex items-center gap-0.5 shrink-0">
            {t("common.seeAll")}
            <ChevronRight className="h-3 w-3" />
          </span>
        </Link>
      )}

      <AlertDialog
        open={!!confirmWithdraw}
        onOpenChange={(open) => !open && setConfirmWithdraw(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("needs:withdrawDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("needs:withdrawDialog.description", {
                need: confirmWithdraw?.needLabel ?? "",
                event: confirmWithdraw?.eventLabel ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("needs:withdrawDialog.abort")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmWithdraw) return;
                setPendingId(confirmWithdraw.signupId);
                withdrawMut.mutate(confirmWithdraw.signupId);
                setConfirmWithdraw(null);
              }}
            >
              {t("needs:withdrawDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
