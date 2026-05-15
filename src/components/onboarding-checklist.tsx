import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Step = {
  id: string;
  label: string;
  hint: string;
  done: boolean;
  to?: string;
  onAction?: () => void;
  cta: string;
};

const STORAGE_KEY = (clubId: string) => `clubero-onboarding-dismissed:${clubId}`;

export function OnboardingChecklist({
  clubId,
  hasLogo,
  onCreateEvent,
}: {
  clubId: string;
  hasLogo: boolean;
  onCreateEvent: () => void;
}) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(STORAGE_KEY(clubId)) === "1");
  }, [clubId]);

  const { data: counts } = useQuery({
    queryKey: ["onboarding-counts", clubId],
    queryFn: async () => {
      const [teamsRes, players, invites] = await Promise.all([
        supabase.from("teams").select("id").eq("club_id", clubId),
        supabase
          .from("players")
          .select("id", { count: "exact", head: true })
          .eq("club_id", clubId),
        supabase
          .from("member_invites")
          .select("id", { count: "exact", head: true })
          .eq("club_id", clubId),
      ]);
      const teamIds = (teamsRes.data ?? []).map((r) => r.id);
      let eventCount = 0;
      if (teamIds.length > 0) {
        const { count } = await supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("status", "published")
          .in("team_id", teamIds);
        eventCount = count ?? 0;
      }
      return {
        teams: teamIds.length,
        players: players.count ?? 0,
        invites: invites.count ?? 0,
        events: eventCount,
      };
    },
  });

  const steps = useMemo<Step[]>(() => {
    const c = counts ?? { teams: 0, players: 0, invites: 0, events: 0 };
    return [
      {
        id: "logo",
        label: t("onboarding.steps.logo.label", { defaultValue: "Ajouter le logo du club" }),
        hint: t("onboarding.steps.logo.hint", {
          defaultValue: "Personnalise l'app pour vos joueurs et parents.",
        }),
        done: hasLogo,
        to: "/profile",
        cta: t("onboarding.cta.upload", { defaultValue: "Ajouter" }),
      },
      {
        id: "team",
        label: t("onboarding.steps.team.label", { defaultValue: "Créer votre première équipe" }),
        hint: t("onboarding.steps.team.hint", {
          defaultValue: "U13, Seniors, Loisirs… donnez-lui un nom et une catégorie.",
        }),
        done: c.teams > 0,
        to: "/teams",
        cta: t("onboarding.cta.create", { defaultValue: "Créer" }),
      },
      {
        id: "players",
        label: t("onboarding.steps.players.label", { defaultValue: "Ajouter vos joueurs" }),
        hint: t("onboarding.steps.players.hint", {
          defaultValue: "Saisissez l'effectif d'au moins une équipe.",
        }),
        done: c.players > 0,
        to: "/teams",
        cta: t("onboarding.cta.add", { defaultValue: "Ajouter" }),
      },
      {
        id: "invites",
        label: t("onboarding.steps.invites.label", {
          defaultValue: "Inviter parents et coachs",
        }),
        hint: t("onboarding.steps.invites.hint", {
          defaultValue: "Ils répondent aux convocations en un tap.",
        }),
        done: c.invites > 0,
        to: "/teams",
        cta: t("onboarding.cta.invite", { defaultValue: "Inviter" }),
      },
      {
        id: "event",
        label: t("onboarding.steps.event.label", {
          defaultValue: "Publier votre premier événement",
        }),
        hint: t("onboarding.steps.event.hint", {
          defaultValue: "Entraînement ou match — testez le flux complet.",
        }),
        done: c.events > 0,
        onAction: onCreateEvent,
        cta: t("onboarding.cta.publish", { defaultValue: "Publier" }),
      },
    ];
  }, [counts, hasLogo, onCreateEvent, t]);

  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;

  if (dismissed || !counts) return null;
  if (completed === total) return null;

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY(clubId), "1");
    setDismissed(true);
  }

  const pct = Math.round((completed / total) * 100);

  return (
    <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-accent/40 p-4 space-y-4 relative overflow-hidden">
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("common.close", { defaultValue: "Fermer" })}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 pr-6">
          <h2 className="text-sm font-semibold">
            {t("onboarding.title", { defaultValue: "Premiers pas" })}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("onboarding.subtitle", {
              defaultValue: "Quelques étapes pour mettre votre club en route.",
              completed,
              total,
            })}{" "}
            · {completed}/{total}
          </p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-primary/10 overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <ul className="space-y-1.5">
        {steps.map((step) => (
          <li key={step.id}>
            <StepRow step={step} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepRow({ step }: { step: Step }) {
  const inner = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
        step.done ? "bg-primary/5" : "bg-card hover:bg-card/80",
      )}
    >
      <span
        className={cn(
          "h-5 w-5 rounded-full flex items-center justify-center shrink-0 border",
          step.done
            ? "bg-primary border-primary text-primary-foreground"
            : "border-border bg-background",
        )}
      >
        {step.done && <Check className="h-3 w-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium truncate",
            step.done && "line-through text-muted-foreground",
          )}
        >
          {step.label}
        </p>
        {!step.done && (
          <p className="text-[11px] text-muted-foreground truncate">{step.hint}</p>
        )}
      </div>
      {!step.done && (
        <span className="text-xs font-medium text-primary flex items-center gap-0.5 shrink-0">
          {step.cta}
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );

  if (step.done) return inner;
  if (step.onAction) {
    return (
      <button type="button" onClick={step.onAction} className="w-full text-left">
        {inner}
      </button>
    );
  }
  if (step.to) {
    return (
      <Link to={step.to} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
