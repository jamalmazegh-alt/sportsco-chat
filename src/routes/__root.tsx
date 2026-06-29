import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { RouteNotFound } from "@/components/route-not-found";
import { AuthProvider } from "@/lib/auth-context";
import i18n from "@/lib/i18n";
import { useTranslation } from "react-i18next";
import { bootstrapTheme } from "@/lib/use-theme";
import { initSentry } from "@/lib/sentry";
import { initPostHog } from "@/lib/posthog";
import { CookieConsentBanner } from "@/components/cookie-consent";
import { ClubThemeProvider } from "@/components/club-theme-provider";
import { applyClubTheme, readStoredTheme } from "@/lib/club-themes";
import { InstallBanner } from "@/components/pwa/InstallBanner";
import { PushPermissionBanner } from "@/components/pwa/PushPermissionBanner";
import { registerServiceWorker } from "@/lib/pwa";
import { syncPushSubscriptionState } from "@/lib/push-subscribe";
import { COMPANY_LEGAL } from "@/config/company";

import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1",
      },
      { title: "Clubero — Team coordination, made simple" },
      {
        name: "description",
        content:
          "Clubero is a fast, mobile-first app for sports clubs to coordinate events, convocations and attendance in seconds.",
      },
      { name: "theme-color", content: "#0B1730" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Clubero" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "mobile-web-app-capable", content: "yes" },
      { property: "og:site_name", content: "Clubero" },
      { property: "og:title", content: "Clubero — Team coordination, made simple" },
      {
        property: "og:description",
        content:
          "Stop chasing parents in WhatsApp. Convocations, attendance, and reminders in one tap.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Clubero — Team coordination, made simple" },
      {
        name: "twitter:description",
        content:
          "Stop chasing parents in WhatsApp. Convocations, attendance, and reminders in one tap.",
      },
      { property: "og:image", content: "https://clubero.app/clubero-logo.png" },
      { name: "twitter:image", content: "https://clubero.app/clubero-logo.png" },
      { name: "google-site-verification", content: "pCAoyuO5oORg-h3Q624Cs7_f9S7LLtOlnD1hMY3xE_4" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/icons/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icons/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icons/icon-512.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Manrope:wght@400;500;600&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: COMPANY_LEGAL.legalName,
          legalName: COMPANY_LEGAL.legalName,
          url: COMPANY_LEGAL.website,
          logo: `${COMPANY_LEGAL.website}/clubero-logo.png`,
          email: COMPANY_LEGAL.email,
          foundingDate: COMPANY_LEGAL.incorporationDate,
          address: {
            "@type": "PostalAddress",
            streetAddress: COMPANY_LEGAL.registeredOffice.street,
            postalCode: COMPANY_LEGAL.registeredOffice.postalCode,
            addressLocality: COMPANY_LEGAL.registeredOffice.city,
            addressCountry: COMPANY_LEGAL.registeredOffice.countryCode,
          },
          identifier: {
            "@type": "PropertyValue",
            propertyID: "Estonian Business Register (registrikood)",
            value: COMPANY_LEGAL.registrationNumber,
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: COMPANY_LEGAL.brandName,
          url: COMPANY_LEGAL.website,
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: RouteNotFound,
});

function RootShell({ children }: { children: React.ReactNode }) {
  const { i18n: i18nInstance } = useTranslation();
  const lang = (i18nInstance.language || i18n.language || "en").slice(0, 2);
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    initSentry();
    initPostHog();
    bootstrapTheme();
    // Apply the last-known club brand colour ASAP (covers login page).
    applyClubTheme(readStoredTheme());
    // Catch Supabase auth error redirects (e.g. expired confirmation link)
    // and route to a friendly resend screen instead of dumping users on a
    // protected route with an unreadable URL hash.
    if (typeof window !== "undefined" && window.location.hash) {
      const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      if (h.get("error") || h.get("error_code")) {
        const code = h.get("error_code") ?? h.get("error") ?? "auth_error";
        window.location.replace(`/tournaments/start?auth_error=${encodeURIComponent(code)}`);
      }
    }
    // PWA: register service worker (guarded — refuses in Lovable preview/dev/iframe)
    registerServiceWorker();
    // Reconcile push permission with our DB: if user revoked notifications in
    // iOS Settings (or browser), clean up stale rows; if granted, re-upsert.
    const runSync = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      syncPushSubscriptionState().catch(() => {
        /* noop */
      });
    };
    runSync();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", runSync);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", runSync);
      }
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ClubThemeProvider>
          <Outlet />
          <Toaster position="top-center" />
          <CookieConsentBanner />
          <InstallBanner />
          <PushPermissionBanner />
        </ClubThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
