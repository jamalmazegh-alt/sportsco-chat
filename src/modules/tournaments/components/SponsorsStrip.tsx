import { useTranslation } from "react-i18next";
import type { Sponsor, SponsorTier } from "../lib/rules";

const TIER_ORDER: Record<SponsorTier, number> = {
  main: 0,
  gold: 1,
  silver: 2,
  partner: 3,
};
const TIER_SIZE: Record<SponsorTier, string> = {
  main: "h-20 md:h-24",
  gold: "h-16 md:h-20",
  silver: "h-12 md:h-16",
  partner: "h-10 md:h-12",
};

export function SponsorsStrip({
  sponsors,
  title,
  compact = false,
}: {
  sponsors: Sponsor[] | undefined;
  title?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation("tournaments");
  const resolvedTitle = title ?? t("public.sponsorsTitleDefault");
  if (!sponsors || sponsors.length === 0) return null;
  const sorted = [...sponsors].sort(
    (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier],
  );
  return (
    <section className="rounded-2xl border border-border bg-card px-4 py-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground text-center mb-4">
        {title}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
        {sorted.map((s) => {
          const sizeClass = compact ? "h-10 md:h-12" : TIER_SIZE[s.tier];
          const img = (
            <img
              src={s.logo_url}
              alt={s.name}
              title={s.name}
              loading="lazy"
              className={`${sizeClass} w-auto object-contain grayscale hover:grayscale-0 transition`}
            />
          );
          return s.website ? (
            <a
              key={s.id}
              href={s.website}
              target="_blank"
              rel="noreferrer noopener sponsored"
              aria-label={s.name}
            >
              {img}
            </a>
          ) : (
            <span key={s.id}>{img}</span>
          );
        })}
      </div>
    </section>
  );
}
