import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Trophy, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackConversion } from "@/lib/conversion-tracking";
import {
  dismissBanner,
  isBannerDismissed,
  shouldShowTournamentBanner,
  type TournamentForBanner,
} from "@/lib/tournament-conversion";

interface Props {
  tournament: TournamentForBanner;
  hasRealClubMembership: boolean;
  resultsCount: number;
  /** Where the banner lives — used in tracking properties. */
  surface: "tournament_admin" | "tournament_public";
}

/**
 * Contextual banner shown to a standalone tournament organiser once their
 * tournament has at least one recorded result, nudging them toward a real
 * club subscription. Dismissible (30-day localStorage TTL).
 */
export function TournamentToClubBanner({
  tournament,
  hasRealClubMembership,
  resultsCount,
  surface,
}: Props) {
  const { t, i18n } = useTranslation("common");
  const [dismissed, setDismissed] = useState(false);

  const visible =
    !dismissed &&
    shouldShowTournamentBanner({ tournament, hasRealClubMembership, resultsCount });

  useEffect(() => {
    if (!visible) return;
    trackConversion(
      "banner_seen",
      {
        tournament_id: tournament.id,
        tournament_status: tournament.status,
        surface,
        language: i18n.language,
      },
      { dedupeKey: `${surface}:${tournament.id}` },
    );
  }, [visible, tournament.id, tournament.status, surface, i18n.language]);

  // Sync dismissed state from storage on mount.
  useEffect(() => {
    if (isBannerDismissed(tournament.id)) setDismissed(true);
  }, [tournament.id]);

  if (!visible) return null;

  const ctaSearch = {
    source: "tournament_conversion",
    tournament_id: tournament.id,
  } as const;

  const onCtaClick = () => {
    trackConversion("banner_clicked", {
      tournament_id: tournament.id,
      cta_label: "primary",
      language: i18n.language,
      surface,
    });
  };

  const onLearnMore = () => {
    trackConversion("banner_clicked", {
      tournament_id: tournament.id,
      cta_label: "learn_more",
      language: i18n.language,
      surface,
    });
  };

  const onDismiss = () => {
    dismissBanner(tournament.id);
    setDismissed(true);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-accent/10 p-5 shadow-sm">
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("tournamentToClub.dismiss")}
        className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md sm:h-14 sm:w-14">
          <Trophy className="h-6 w-6 sm:h-7 sm:w-7" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-base font-semibold leading-tight sm:text-lg">
            {t("tournamentToClub.title")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("tournamentToClub.subtitle")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            asChild
            size="sm"
            className="h-10 px-4 font-semibold shadow-sm"
            onClick={onCtaClick}
          >
            <Link
              to="/pricing"
              search={ctaSearch as unknown as Record<string, string>}
            >
              {t("tournamentToClub.ctaPrimary")}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-10 px-3 text-muted-foreground hover:text-foreground"
            onClick={onLearnMore}
          >
            <Link
              to="/pricing"
              search={ctaSearch as unknown as Record<string, string>}
            >
              {t("tournamentToClub.ctaSecondary")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
