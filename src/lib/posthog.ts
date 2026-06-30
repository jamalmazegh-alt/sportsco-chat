import posthog from "posthog-js";

let initialized = false;

// PostHog client (publishable) key — safe to ship in the browser bundle.
// Fallback ensures prod builds work even when VITE_POSTHOG_KEY isn't injected
// at build time (Lovable reserves the VITE_ prefix, so we can't add it as a secret).
const POSTHOG_KEY_FALLBACK = "phc_woXHHb3AivAeGnzdNgW6EjRYLU42gDNLrRpLZH3NTz5m";
const POSTHOG_HOST_FALLBACK = "https://eu.i.posthog.com";

export function initPostHog(): void {
  if (initialized) return;
  if (typeof window === "undefined") return;
  const envKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const envHost = import.meta.env.VITE_POSTHOG_HOST as string | undefined;
  const key = envKey || POSTHOG_KEY_FALLBACK;
  const host = envHost || POSTHOG_HOST_FALLBACK;
  // Temporary diagnostic: confirm whether the key was inlined at build time.
  // Never logs the full key — only presence + length + a short prefix.

  console.info("[posthog] init check", {
    hasEnvKey: Boolean(envKey),
    keyLen: key.length,
    keyPrefix: key.slice(0, 8),
    host,
  });
  if (!key) return;
  posthog.init(key, {
    api_host: host,
    person_profiles: "identified_only",
    // Beta policy: pageviews + identify/reset only.
    // Business events are added explicitly later via an analytics wrapper.
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_surveys_automatic_display: true,
    disable_web_experiments: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_external_dependency_loading: true,
    rageclick: false,
    capture_performance: false,
    capture_heatmaps: false,
    advanced_disable_flags: true,
    advanced_disable_decide: true,
    advanced_disable_feature_flags: true,
    advanced_disable_feature_flags_on_first_load: true,
    advanced_disable_toolbar_metrics: true,
    persistence: "localStorage+cookie",
  });
  initialized = true;
  posthog.capture("$pageview", {
    $current_url: window.location.href,
  });
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
