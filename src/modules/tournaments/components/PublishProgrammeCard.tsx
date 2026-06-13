import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, X, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import {
  listTournamentRegistrationsWithPayments,
  publishTournamentProgramme,
} from "@/modules/tournaments/tournament-payments.functions";

interface PublishProgrammeCardProps {
  tournamentId: string;
  status: string;
  teams: { id: string; group_id: string | null }[];
  matchesCount: number;
  hasStartDate: boolean;
}

export function PublishProgrammeCard({
  tournamentId,
  status,
  teams,
  matchesCount,
  hasStartDate,
}: PublishProgrammeCardProps) {
  const { t } = useTranslation("tournaments");
  const qc = useQueryClient();
  const publishFn = useServerFn(publishTournamentProgramme);
  const listFn = useServerFn(listTournamentRegistrationsWithPayments);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const regsQuery = useQuery({
    queryKey: ["tournament-payments", tournamentId],
    queryFn: () => listFn({ data: { tournament_id: tournamentId } }),
    enabled: status === "published",
  });

  // B1 — useMutation MUST be declared before any early return so that the hook
  // call order is stable across renders (React rules of hooks).
  const m = useMutation({
    mutationFn: () => publishFn({ data: { tournament_id: tournamentId } }),
    onSuccess: () => {
      toast.success(t("tournament.programmePublished"));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      setConfirmOpen(false);
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Error");
      setConfirmOpen(false);
    },
  });

  // Only show when tournament is in the "published" stage
  if (status !== "published") return null;

  const PAID = new Set(["paid_online", "paid_offline", "free"]);
  const confirmedTeamsCount =
    regsQuery.data?.payments.filter((p: any) => PAID.has(p.payment_status)).length ?? 0;
  const unassignedConfirmedTeamsCount = teams.filter((tt) => !tt.group_id).length;

  const checks = [
    {
      ok: confirmedTeamsCount >= 2,
      label: t("tournament.checkTeamsConfirmed"),
    },
    {
      ok: confirmedTeamsCount >= 1 && unassignedConfirmedTeamsCount === 0,
      label: t("tournament.checkTeamsAssigned"),
    },
    {
      ok: matchesCount >= 1,
      label: t("tournament.checkMatchesGenerated"),
    },
    {
      ok: hasStartDate,
      label: t("tournament.checkStartDate"),
    },
  ];
  const allOk = checks.every((c) => c.ok) && !regsQuery.isLoading;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 shrink-0">
          <Rocket className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{t("tournament.publishProgramme")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("tournament.publishProgrammeSubtitle")}
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 font-medium">
            ⚠ {t("tournament.publishProgrammeIrreversible")}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {checks.map((c, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full shrink-0",
                c.ok
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {c.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            </span>
            <span className={cn(c.ok ? "" : "text-muted-foreground")}>{c.label}</span>
          </li>
        ))}
      </ul>

      <Button
        size="lg"
        className="w-full"
        disabled={!allOk || m.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {m.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Rocket className="h-4 w-4" />
            {t("tournament.publishProgramme")}
          </>
        )}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tournament.publishConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("tournament.publishConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={m.isPending}>
              {t("common.cancel", { defaultValue: "Annuler" })}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={m.isPending}
              onClick={(e) => {
                e.preventDefault();
                m.mutate();
              }}
            >
              {m.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("tournament.publishProgramme")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
