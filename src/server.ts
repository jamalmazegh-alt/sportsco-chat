import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

// Security headers applied to every response.
// CSP is intentionally permissive on connect-src to allow Supabase, Stripe,
// Google APIs (Maps, Search Console), PostHog, and the Lovable AI gateway.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), payment=(self)",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://maps.googleapis.com https://www.googletagmanager.com https://eu-assets.i.posthog.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.lovable.cloud wss://*.lovable.cloud https://api.stripe.com https://maps.googleapis.com https://*.googleapis.com https://nominatim.openstreetmap.org https://eu.i.posthog.com https://eu-assets.i.posthog.com https://ai.gateway.lovable.dev",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; "),
};

// Origines des WebViews Capacitor : `capacitor://localhost` sur iOS,
// `https://localhost` sur Android (`androidScheme` vaut `https` par défaut depuis
// Capacitor 1.2 — épinglé explicitement dans `capacitor.config.ts` puisque cette
// allowlist en dépend). Allowlist stricte et fermée — jamais `*`.
//
// `http://localhost` est délibérément absent : aucune WebView ne l'émet avec la
// configuration retenue, et l'autoriser élargirait la surface CORS de la prod à
// tout serveur local d'un poste de développeur.
//
// Toute requête sans en-tête `Origin`, ou portant une autre origine, reçoit
// exactement la réponse qu'elle recevait avant : le trafic web n'est pas affecté.
const NATIVE_ORIGINS = new Set(["capacitor://localhost", "https://localhost"]);

function nativeCorsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function applyNativeCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(nativeCorsHeaders(origin))) {
    headers.set(k, v);
  }
  // La réponse varie selon l'origine : indispensable pour ne pas empoisonner
  // les caches intermédiaires avec une réponse taillée pour la WebView.
  const vary = headers.get("Vary");
  headers.set("Vary", vary && !/\borigin\b/i.test(vary) ? `${vary}, Origin` : (vary ?? "Origin"));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const origin = request.headers.get("Origin") ?? "";
    const fromNativeApp = NATIVE_ORIGINS.has(origin);

    // Preflight : répondre sans réveiller le handler SSR.
    if (fromNativeApp && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: nativeCorsHeaders(origin) });
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      const secured = applySecurityHeaders(normalized);
      return fromNativeApp ? applyNativeCors(secured, origin) : secured;
    } catch (error) {
      console.error(error);
      const secured = applySecurityHeaders(brandedErrorResponse());
      return fromNativeApp ? applyNativeCors(secured, origin) : secured;
    }
  },
};
