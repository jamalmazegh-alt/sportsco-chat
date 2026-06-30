import posthog from "posthog-js";

let initialized = false;

export function initPostHog(): void {
  if (initialized) return;
  if (typeof window === "undefined") return;
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const host =
    (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://eu.i.posthog.com";
  // Temporary diagnostic: confirm whether the key was inlined at build time.
  // Never logs the full key — only presence + length + a short prefix.
  // eslint-disable-next-line no-console
  console.info("[posthog] init check", {
    hasKey: Boolean(key),
    keyLen: key?.length ?? 0,
    keyPrefix: key ? key.slice(0, 8) : null,
    host,
  });
  if (!key) return;
  posthog.init(key, {
    api_host: host,
    person_profiles: "identified_only",
    // Beta policy: pageviews + identify/reset only.
    // Business events are added explicitly later via an analytics wrapper.
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
    rageclick: false,
    capture_performance: false,
    capture_heatmaps: false,
    advanced_disable_toolbar_metrics: true,
    persistence: "localStorage+cookie",
  });
  initialized = true;
}

export function identifyPostHog(
  userId: string,
  props?: { email?: string | null; [k: string]: unknown },
): void {
  if (!initialized || typeof window === "undefined") return;
  const { email, ...rest } = props ?? {};
  posthog.identify(userId, { ...(email ? { email } : {}), ...rest });
}

export function resetPostHog(): void {
  if (!initialized || typeof window === "undefined") return;
  posthog.reset();
}

export { posthog };
