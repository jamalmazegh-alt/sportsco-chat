import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { RouteNotFound } from "@/components/route-not-found";
import { AuthProvider } from "@/lib/auth-context";
import { installDomTranslationGuard } from "@/lib/dom-translation-guard";
import { installStaleChunkGuard } from "@/lib/stale-chunk-guard";
import i18n from "@/lib/i18n";

installDomTranslationGuard();
installStaleChunkGuard();
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
import { isUnsupportedWebView } from "@/lib/webview-support";
import { UnsupportedWebViewScreen } from "@/components/unsupported-webview-screen";
import { initNativeShell } from "@/lib/native-shell";
import { OfflineBanner } from "@/components/offline-banner";
import { isNativePlatform } from "@/lib/native-platform";
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
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
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
    ],
    scripts: [
      {
        // Polyfills pour WebView Android anciennes. Les WebView ne suivent pas
        // la version d'Android : un Galaxy S10 sous Android 11 peut tourner en
        // WebView 83 (2020) — constaté sur un appareil réel, où l'app restait
        // figée sur le splash.
        //
        // `build.target: chrome80` (vite.config.ts) transpile la SYNTAXE, mais
        // pas les API : celles-ci doivent être comblées à l'exécution. Ce script
        // est inline et en tête pour s'exécuter avant tout module.
        //
        // Chaque polyfill est gardé : sur un navigateur récent, coût nul.
        children: `(function(){
if(!Object.hasOwn){Object.hasOwn=function(o,k){return Object.prototype.hasOwnProperty.call(o,k)}}
if(!Array.prototype.at){Array.prototype.at=function(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;return n<0||n>=this.length?undefined:this[n]}}
if(!String.prototype.at){String.prototype.at=function(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;return n<0||n>=this.length?undefined:this[n]}}
if(!String.prototype.replaceAll){String.prototype.replaceAll=function(s,r){if(Object.prototype.toString.call(s)==="[object RegExp]"){if(!s.global)throw new TypeError("replaceAll must be called with a global RegExp");return this.replace(s,r)}var str=String(this),sub=String(s);if(typeof r!=="function")return str.split(sub).join(r);if(sub==="")return str;var out="",from=0,i;while((i=str.indexOf(sub,from))!==-1){out+=str.slice(from,i)+r(sub,i,str);from=i+sub.length}return out+str.slice(from)}}
if(typeof WeakRef==="undefined"){window.WeakRef=function(t){this._t=t};window.WeakRef.prototype.deref=function(){return this._t}}
if(!Array.prototype.findLast){Array.prototype.findLast=function(f,t){for(var i=this.length-1;i>=0;i--)if(f.call(t,this[i],i,this))return this[i];return undefined}}
if(!Array.prototype.findLastIndex){Array.prototype.findLastIndex=function(f,t){for(var i=this.length-1;i>=0;i--)if(f.call(t,this[i],i,this))return i;return -1}}
if(!Array.prototype.with){Array.prototype.with=function(i,v){var a=Array.prototype.slice.call(this);i=Math.trunc(i)||0;if(i<0)i+=a.length;a[i]=v;return a}}
if(typeof AggregateError==="undefined"){window.AggregateError=function(e,m){var r=new Error(m);r.name="AggregateError";r.errors=Array.prototype.slice.call(e);return r}}
if(!window.structuredClone){window.structuredClone=function c(v,m){m=m||new WeakMap();if(v===null||typeof v!=="object")return v;if(m.has(v))return m.get(v);var r;if(v instanceof Date)r=new Date(v.getTime());else if(v instanceof RegExp)r=new RegExp(v.source,v.flags);else if(v instanceof Map){r=new Map();m.set(v,r);v.forEach(function(x,k){r.set(c(k,m),c(x,m))});return r}else if(v instanceof Set){r=new Set();m.set(v,r);v.forEach(function(x){r.add(c(x,m))});return r}else if(Array.isArray(v)){r=[];m.set(v,r);for(var i=0;i<v.length;i++)r[i]=c(v[i],m);return r}else{r={};m.set(v,r);for(var k in v)if(Object.prototype.hasOwnProperty.call(v,k))r[k]=c(v[k],m);return r}m.set(v,r);return r}}
})();`,
      },
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
          telephone: COMPANY_LEGAL.phone,
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
    <html lang={lang} translate="no" className="notranslate" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
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
  // WebView trop ancienne pour Tailwind v4 : sans ceci l'app s'affiche
  // entièrement sans style, sans que l'utilisateur puisse comprendre pourquoi.
  // Évalué au premier rendu, avant tout le reste — l'écran de secours n'a
  // besoin ni du routeur, ni des styles, ni de l'i18n.
  const [unsupported, setUnsupported] = useState(false);
  useEffect(() => {
    setUnsupported(isUnsupportedWebView());
  }, []);

  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    // Coquille native (splash, barre d'état, bouton retour Android) — no-op web.
    initNativeShell();
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
    // En natif, l'équivalent est `initNativePushOnLaunch()` (canal fcm/apns) —
    // ce sync-là ne parle que Web Push et n'a rien à réconcilier.
    const runSync = () => {
      if (isNativePlatform()) return;
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

  if (unsupported) return <UnsupportedWebViewScreen />;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ClubThemeProvider>
          <Outlet />
          <OfflineBanner />
          <Toaster position="top-center" />
          <CookieConsentBanner />
          <InstallBanner />
          <PushPermissionBanner />
        </ClubThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
