import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN ?? "https://e2d872518bc593819079553d18a330c4@o4511446455549952.ingest.de.sentry.io/4511446461710417";

let initialized = false;

export function initSentry() {
  if (initialized) return;
  if (typeof window === "undefined") return;

  // Skip in dev / preview to avoid noise
  const host = window.location.hostname;
  const isProd = host === "clubero.app" || host === "www.clubero.app" || host === "sportsco-chat.lovable.app";
  if (!isProd) return;

  Sentry.init({
    dsn: DSN,
    environment: host,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    beforeSend(event) {
      // Drop ResizeObserver noise
      const msg = event.message || event.exception?.values?.[0]?.value || "";
      if (/ResizeObserver loop/i.test(msg)) return null;
      return event;
    },
  });
  initialized = true;
}

export { Sentry };
