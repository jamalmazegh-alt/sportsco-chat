// Host detection: app subdomain vs. public marketing host.
// During the subdomain split, code paths can branch on `isAppHost()`.
// Detection is purely client-side (window.location.host); on SSR we default
// to "marketing host" so crawlers see the public site.

const APP_HOST_PREFIXES = ["app."];

export function getHost(): string {
  if (typeof window === "undefined") return "";
  return window.location.host.toLowerCase();
}

export function isAppHost(): boolean {
  const host = getHost();
  if (!host) return false;
  return APP_HOST_PREFIXES.some((p) => host.startsWith(p));
}

export function isMarketingHost(): boolean {
  if (typeof window === "undefined") return true;
  return !isAppHost();
}
