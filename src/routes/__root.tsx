import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";
import i18n from "@/lib/i18n";
import { useTranslation } from "react-i18next";
import { bootstrapTheme } from "@/lib/use-theme";
import { CookieConsentBanner } from "@/components/cookie-consent";

import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1",
      },
      { title: "Clubero — Team coordination, made simple" },
      {
        name: "description",
        content:
          "Clubero is a fast, mobile-first app for sports clubs to coordinate events, convocations and attendance in seconds.",
      },
      { name: "theme-color", content: "#7cc142" },
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
      { name: "twitter:description", content: "Stop chasing parents in WhatsApp. Convocations, attendance, and reminders in one tap." },
      { property: "og:image", content: "https://clubero.app/clubero-logo.png" },
      { name: "twitter:image", content: "https://clubero.app/clubero-logo.png" },
      { name: "google-site-verification", content: "pCAoyuO5oORg-h3Q624Cs7_f9S7LLtOlnD1hMY3xE_4" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Clubero",
          url: "https://clubero.app",
          logo: "https://clubero.app/clubero-logo.png",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Clubero",
          url: "https://clubero.app",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
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
    bootstrapTheme();
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
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster position="top-center" />
        <CookieConsentBanner />
      </AuthProvider>
    </QueryClientProvider>
  );
}
