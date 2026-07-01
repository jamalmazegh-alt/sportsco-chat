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

const ROTATION_MS = 12_000;
const IMPRESSION_VISIBLE_MS = 1_000;
const CLICK_DEBOUNCE_MS = 500;
/** Visibility knob — max rendered height of the logo (object-contain). */
const SPONSOR_LOGO_MAX_HEIGHT = 40;

type Sponsor = {
  id: string;
  name: string;
  logo_url: string | null;
  target_url: string | null;
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

  const list = useMemo<Sponsor[]>(() => sponsors ?? [], [sponsors]);

  // Advance to next sponsor on mount (remount of home tab).
  useEffect(() => {
    if (list.length === 0) return;
    setIndex((prev) => (prev + 1) % list.length);
  }, [list.length]);

  const current = list.length > 0 ? list[index % list.length] : null;

  useEffect(() => {
    setImgFailed(false);
  }, [current?.id]);

  // Impression tracking — >50% visible ~1s, gated by document visibility.
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

  // Nothing to show → render nothing (no separators, no layout shift).
  if (!current) return null;

  const showTextFallback = !current.logo_url || imgFailed;
  const hasLink = !!current.target_url && isSafeHttpUrl(current.target_url);

  const inner = (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {t("sponsor.thanksLabel")}
      </span>
      <span className="relative inline-flex max-w-full items-center justify-center overflow-visible transition-transform active:scale-[0.98] dark:bg-white dark:rounded-md dark:px-1.5 dark:py-0.5">
        {showTextFallback ? (
          <span className="line-clamp-2 text-sm font-semibold text-foreground dark:text-neutral-900">
            {current.name}
          </span>
        ) : (
          <img
            src={current.logo_url!}
            alt={current.name}
            style={{ maxHeight: `${SPONSOR_LOGO_MAX_HEIGHT}px` }}
            className="w-auto max-w-full object-contain"
            onError={() => setImgFailed(true)}
            loading="lazy"
          />
        )}
      </span>
    </>
  );

  return (
    <div
      ref={containerRef}
      className="w-full border-y border-border/60 bg-transparent"
      style={{ borderTopWidth: "0.5px", borderBottomWidth: "0.5px" }}
    >
      {hasLink ? (
        <a
          href={current.target_url!}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          aria-label={t("sponsor.visitExternalAria", { name: current.name })}
          className="group flex w-full min-h-12 cursor-pointer flex-col items-center justify-center gap-2 bg-transparent px-4 py-4 text-center transition-opacity hover:opacity-95 active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {inner}
        </a>
      ) : (
        <div className="group flex w-full min-h-12 flex-col items-center justify-center gap-2 bg-transparent px-4 py-4 text-center">
          {inner}
        </div>
      )}
    </div>
  );
}
