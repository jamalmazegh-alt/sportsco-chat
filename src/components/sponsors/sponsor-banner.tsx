import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";

import {
  getActiveSponsorsForHome,
  recordSponsorClick,
  recordSponsorImpression,
} from "@/lib/sponsors.functions";
import { shouldRecordClick, shouldRecordImpression } from "@/lib/sponsor-session";
import { SponsorLogo } from "./SponsorLogo";
import { SponsorBannerFrame } from "./SponsorBannerFrame";
import {
  SPONSOR_LOGO_MAX_HEIGHT,
  SPONSOR_LOGO_MAX_WIDTH,
  clampSponsorLogoScale,
} from "./sponsor-logo.constants";

const ROTATION_MS = 12_000;
const IMPRESSION_VISIBLE_MS = 1_000;
const CLICK_DEBOUNCE_MS = 500;

type Sponsor = {
  id: string;
  name: string;
  logo_url: string | null;
  target_url: string | null;
  logo_scale: number;
};

function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function SponsorBanner({ clubId }: { clubId: string }) {
  const { t } = useTranslation();
  const getFn = useServerFn(getActiveSponsorsForHome);
  const impressionFn = useServerFn(recordSponsorImpression);
  const clickFn = useServerFn(recordSponsorClick);

  const { data: sponsors } = useQuery({
    queryKey: ["sponsors-home", clubId],
    queryFn: () => getFn({ data: { clubId } }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [index, setIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isVisibleRef = useRef(false);
  const [imgFailed, setImgFailed] = useState(false);

  const list = useMemo<Sponsor[]>(
    () =>
      (sponsors ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        logo_url: s.logo_url ?? null,
        target_url: s.target_url ?? null,
        logo_scale: Number(s.logo_scale ?? 1),
      })),
    [sponsors],
  );

  useEffect(() => {
    if (list.length === 0) return;
    setIndex((prev) => (prev + 1) % list.length);
  }, [list.length]);

  const current = list.length > 0 ? list[index % list.length] : null;

  useEffect(() => {
    setImgFailed(false);
  }, [current?.id]);

  useEffect(() => {
    if (!current || !containerRef.current) return;
    const el = containerRef.current;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const visible = entry.isIntersecting && entry.intersectionRatio > 0.5;
          isVisibleRef.current = visible && document.visibilityState === "visible";
          if (visible && document.visibilityState === "visible") {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
              if (isVisibleRef.current && shouldRecordImpression(current.id)) {
                impressionFn({ data: { sponsorId: current.id } }).catch(() => {});
              }
            }, IMPRESSION_VISIBLE_MS);
          } else if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(el);

    const onVis = () => {
      isVisibleRef.current = isVisibleRef.current && document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (timer) clearTimeout(timer);
    };
  }, [current, impressionFn]);

  useEffect(() => {
    if (list.length <= 1) return;
    const id = setInterval(() => {
      if (isVisibleRef.current && document.visibilityState === "visible") {
        setIndex((prev) => (prev + 1) % list.length);
      }
    }, ROTATION_MS);
    return () => clearInterval(id);
  }, [list.length]);

  const lastClickRef = useRef(0);
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!current) return;
    const now = Date.now();
    if (now - lastClickRef.current < CLICK_DEBOUNCE_MS) {
      e.preventDefault();
      return;
    }
    lastClickRef.current = now;
    if (!current.target_url || !isSafeHttpUrl(current.target_url)) {
      e.preventDefault();
      return;
    }
    if (shouldRecordClick(current.id)) {
      clickFn({ data: { sponsorId: current.id } }).catch(() => {});
    }
  };

  if (!current) return null;

  const showTextFallback = !current.logo_url || imgFailed;
  const hasLink = !!current.target_url && isSafeHttpUrl(current.target_url);
  const logoScale = clampSponsorLogoScale(current.logo_scale);

  return (
    <div ref={containerRef}>
      <SponsorBannerFrame
        label={t("sponsor.thanksLabel")}
        action={hasLink}
        href={hasLink ? current.target_url! : undefined}
        onClick={handleClick}
        ariaLabel={t("sponsor.visitExternalAria", { name: current.name })}
      >
        {showTextFallback ? (
          <span className="line-clamp-2 text-sm font-semibold text-foreground dark:text-neutral-900">
            {current.name}
          </span>
        ) : (
          <SponsorLogo
            src={current.logo_url!}
            alt={current.name}
            maxHeight={SPONSOR_LOGO_MAX_HEIGHT * logoScale}
            maxWidth={SPONSOR_LOGO_MAX_WIDTH * logoScale}
            onError={() => setImgFailed(true)}
          />
        )}
      </SponsorBannerFrame>
    </div>
  );
}
