import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { getApiOrigin, isNativePlatform } from "./lib/native-platform";

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  // Bypass for /lovable/* internal routes (webhooks, queue dispatcher)
  const url = new URL(request.url);
  if (url.pathname.startsWith("/lovable/")) {
    return next();
  }
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Les RPC de server functions ciblent une URL relative (`/_serverFn/<id>`). En
// WebView Capacitor l'origine est `capacitor://localhost` (iOS) ou
// `http://localhost` (Android) : ces appels n'atteindraient aucun serveur. On les
// réécrit vers le backend distant.
//
// Hors natif — donc sur 100 % du trafic web — cette fonction délègue au `fetch`
// global sans rien modifier. `isNativePlatform()` lit un global injecté par le
// runtime Capacitor, sans importer son SDK : le bundle web reste inchangé.
const serverFnFetch: typeof fetch = (input, init) => {
  if (!isNativePlatform()) return fetch(input, init);

  const origin = getApiOrigin();
  if (!origin) return fetch(input, init);

  // TanStack Start construit l'URL par concaténation de chaînes
  // (`TSS_SERVER_FN_BASE + functionId`) et la passe telle quelle : en pratique
  // `input` est toujours une string relative. On couvre malgré tout `URL` et
  // `Request` pour ne pas dépendre silencieusement d'un détail d'implémentation
  // — si l'amont changeait, l'appel natif échouerait sans erreur explicite.
  const path =
    typeof input === "string" ? input : input instanceof URL ? input.pathname + input.search : null;

  if (path?.startsWith("/")) {
    return fetch(`${origin}${path}`, init);
  }
  if (input instanceof Request && input.url.startsWith("/")) {
    return fetch(new Request(`${origin}${input.url}`, input), init);
  }
  return fetch(input, init);
};

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
  serverFns: { fetch: serverFnFetch },
}));
