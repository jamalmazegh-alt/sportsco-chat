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

type Sponsor = {
  id: string;
  name: string;
  logo_url: string | null;
  target_url: string;
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

  // Round-robin index. Advance on mount (already handled by initial state) and
  // on visibility-gated interval.
  const [index, setIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isVisibleRef = useRef(false);
  const [imgFailed, setImgFailed] = useState(false);

  const list = useMemo<Sponsor[]>(() => sponsors ?? [], [sponsors]);

  // Advance to next sponsor on mount (remount of home tab).
  useEffect(() => {
    if (list.length === 0) return;
    setIndex((prev) => (prev + 1) % list.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  const current = list.length > 0 ? list[index % list.length] : null;

  // Reset image error when sponsor changes.
  useEffect(() => {
    setImgFailed(false);
  }, [current?.id]);

  // IntersectionObserver — track visibility and count impression after 1s visible.
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

  // Auto-advance only when visible and foregrounded.
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
  const onClick = () => {
    if (!current) return;
    const now = Date.now();
    if (now - lastClickRef.current < CLICK_DEBOUNCE_MS) return;
    lastClickRef.current = now;
    if (!isSafeHttpUrl(current.target_url)) return;
    if (shouldRecordClick(current.id)) {
      clickFn({ data: { sponsorId: current.id } }).catch(() => {});
    }
    window.open(current.target_url, "_blank", "noopener,noreferrer");
  };

  if (!current) return null;

  const showTextFallback = !current.logo_url || imgFailed;

  return (
    <div ref={containerRef} className="w-full">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
        {t("sponsor.thanksLabel")}
      </p>
      <button
        type="button"
        onClick={onClick}
        aria-label={t("sponsor.visitAria", { name: current.name })}
        className="group flex aspect-[4/1] w-full items-center justify-center overflow-hidden rounded-2xl border border-border bg-white p-3 shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {showTextFallback ? (
          <span className="line-clamp-2 px-4 text-center text-sm font-semibold text-neutral-800">
            {current.name}
          </span>
        ) : (
          <img
            src={current.logo_url!}
            alt={current.name}
            className="max-h-full max-w-full object-contain"
            onError={() => setImgFailed(true)}
            loading="lazy"
          />
        )}
      </button>
    </div>
  );
}
