import posthog from "posthog-js";

let initialized = false;

export function initPostHog(): void {
  if (initialized) return;
  if (typeof window === "undefined") return;
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return;
  const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://eu.i.posthog.com";
  posthog.init(key, {
    api_host: host,
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    disable_session_recording: true,
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
