import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Users,
  UserPlus,
  CalendarPlus,
  PartyPopper,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const SEEN_KEY = (userId: string, clubId: string) =>
  `clubero-wizard-seen:${userId}:${clubId}`;

type Step = {
  id: string;
  icon: typeof Users;
  title: string;
  body: string;
  cta: string;
  to?: string;
  done?: boolean;
};

export function OnboardingWizard() {
  const { t } = useTranslation();
  const { user, memberships, activeClubId } = useAuth();
  const isAdmin = !!memberships.find(
    (m) => m.club_id === activeClubId && m.role === "admin",
  );

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const { data: counts } = useQuery({
    enabled: isAdmin && !!activeClubId,
    queryKey: ["wizard-counts", activeClubId],
    queryFn: async () => {
      const [teamsRes, playersRes, invitesRes] = await Promise.all([
        supabase.from("teams").select("id").eq("club_id", activeClubId!),
        supabase
          .from("players")
          .select("id", { count: "exact", head: true })
          .eq("club_id", activeClubId!),
        supabase
          .from("member_invites")
          .select("id", { count: "exact", head: true })
          .eq("club_id", activeClubId!),
      ]);
      const teamIds = (teamsRes.data ?? []).map((r) => r.id);
      let eventsCount = 0;
      if (teamIds.length > 0) {
        const { count } = await supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .in("team_id", teamIds);
        eventsCount = count ?? 0;
      }
      return {
        teams: teamIds.length,
        players: playersRes.count ?? 0,
        invites: invitesRes.count ?? 0,
        events: eventsCount,
      };
    },
  });

  // Decide once whether to show the wizard
  useEffect(() => {
    if (!isAdmin || !user?.id || !activeClubId || !counts) return;
    if (typeof window === "undefined") return;
    const trulyEmpty = counts.teams === 0 && counts.players === 0;
    // Brand-new club → always show, even if previously dismissed
    if (trulyEmpty) {
      localStorage.removeItem(SEEN_KEY(user.id, activeClubId));
      setOpen(true);
      return;
    }
    const seen = localStorage.getItem(SEEN_KEY(user.id, activeClubId));
    if (seen === "1") return;
    if (counts.teams === 0 || counts.players === 0) {
      setOpen(true);
    } else {
      localStorage.setItem(SEEN_KEY(user.id, activeClubId), "1");
    }
  }, [isAdmin, user?.id, activeClubId, counts]);

  const steps = useMemo<Step[]>(() => {
    const c = counts ?? { teams: 0, players: 0, invites: 0, events: 0 };
    return [
      {
        id: "welcome",
        icon: Sparkles,
        title: t("onboarding.wizard.welcomeTitle"),
        body: t("onboarding.wizard.welcomeBody"),
        cta: t("onboarding.wizard.welcomeCta"),
      },
      {
        id: "team",
        icon: Users,
        title: t("onboarding.wizard.teamTitle"),
        body: t("onboarding.wizard.teamBody"),
        cta: c.teams > 0 ? t("onboarding.wizard.teamCtaView") : t("onboarding.wizard.teamCtaCreate"),
        to: "/teams",
        done: c.teams > 0,
      },
      {
        id: "players",
        icon: UserPlus,
        title: t("onboarding.wizard.playersTitle"),
        body: t("onboarding.wizard.playersBody"),
        cta: c.players > 0 ? t("onboarding.wizard.playersCtaManage") : t("onboarding.wizard.playersCtaAdd"),
        to: "/teams",
        done: c.players > 0,
      },
      {
        id: "event",
        icon: CalendarPlus,
        title: t("onboarding.wizard.eventTitle"),
        body: t("onboarding.wizard.eventBody"),
        cta: c.events > 0 ? t("onboarding.wizard.eventCtaView") : t("onboarding.wizard.eventCtaCreate"),
        to: "/events",
        done: c.events > 0,
      },
      {
        id: "done",
        icon: PartyPopper,
        title: t("onboarding.wizard.doneTitle"),
        body: t("onboarding.wizard.doneBody"),
        cta: t("onboarding.wizard.doneCta"),
      },
    ];
  }, [counts, t]);

  function close() {
    if (user?.id && activeClubId) {
      localStorage.setItem(SEEN_KEY(user.id, activeClubId), "1");
    }
    setOpen(false);
  }

  if (!isAdmin) return null;
  const current = steps[step];
  if (!current) return null;
  const Icon = current.icon;
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">{current.title}</DialogTitle>
          <DialogDescription className="text-center">
            {current.body}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-1.5 py-2">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={
                i === step
                  ? "h-1.5 w-6 rounded-full bg-primary"
                  : s.done
                    ? "h-1.5 w-1.5 rounded-full bg-primary/60"
                    : "h-1.5 w-1.5 rounded-full bg-muted"
              }
            />
          ))}
        </div>

        {current.done && !isFirst && !isLast && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t("onboarding.wizard.alreadyDone")}
          </p>
        )}

        <div className="flex flex-col gap-2 pt-2">
          {current.to ? (
            <Button asChild className="w-full" onClick={close}>
              <Link to={current.to}>
                {current.cta} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button
              className="w-full"
              onClick={() => (isLast ? close() : setStep(step + 1))}
            >
              {current.cta}
            </Button>
          )}

          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={isFirst}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              {t("common.previous")}
            </button>
            {!isLast && current.to && (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="text-muted-foreground hover:text-foreground"
              >
                {t("common.skip")}
              </button>
            )}
            <button
              type="button"
              onClick={close}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
