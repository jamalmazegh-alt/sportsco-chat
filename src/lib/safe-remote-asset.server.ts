import { createLogger } from "@/lib/logger.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const log = createLogger("safe-remote-asset");

const STORAGE_MARKERS = [
  { marker: "/club-logos/", bucket: "club-logos" },
  { marker: "/attachments/", bucket: "attachments" },
  { marker: "/tournament-documents/", bucket: "tournament-documents" },
] as const;

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 6 * 1024 * 1024;

/**
 * Decode a storage object path and reject traversal (including %2e%2e after decode).
 */
export function normalizeStorageObjectPath(rawPath: string): string | null {
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (!decoded || decoded.includes("..")) return null;
  return decoded;
}

export function extractPublicStoragePath(url: string, bucket: string): string | null {
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  const rawPath = url
    .slice(idx + marker.length)
    .split("?")[0]
    ?.split("#")[0];
  if (!rawPath) return null;
  return normalizeStorageObjectPath(rawPath);
}

export function isStoragePathScopedToTournament(path: string, tournamentId: string): boolean {
  return path.startsWith(`${tournamentId}/`);
}

export async function downloadPublicStorageObject(
  bucket: string,
  path: string,
): Promise<ArrayBuffer | null> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !data) {
    log.warn("storage_download_failed", { bucket, path, err: error?.message });
    return null;
  }
  return data.arrayBuffer();
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b === 100) return true;
  return false;
}

export function isBlockedFetchHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "metadata.google.internal" || h.endsWith(".internal")) return true;
  if (h === "0.0.0.0" || h === "::" || h === "::1") return true;
  if (h === "169.254.169.254" || h === "100.100.100.200") return true;
  if (h.startsWith("fe80:")) return true;
  if ((h.startsWith("fc") || h.startsWith("fd")) && h.includes(":")) return true;
  // Non-dotted IP literal forms (no DNS resolution performed).
  if (/^\d+$/.test(h)) return true;
  if (/^0x[0-9a-f]+$/i.test(h)) return true;
  if (/^0\d+$/.test(h)) return true;
  if (h.startsWith("::ffff:")) return true;
  if (isPrivateIpv4(h)) return true;
  return false;
}

export function isSafeHttpsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function validateFetchUrl(url: string): URL | null {
  if (!isSafeHttpsUrl(url)) return null;
  const parsed = new URL(url);
  if (isBlockedFetchHostname(parsed.hostname)) return null;
  return parsed;
}

async function readResponseBytes(res: Response, maxBytes: number): Promise<ArrayBuffer | null> {
  const len = res.headers.get("content-length");
  if (len && Number(len) > maxBytes) return null;
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) return null;
  return buf;
}

/**
 * HTTPS fetch with redirect:manual, destination re-validation, timeout and size cap.
 * DNS rebinding between validation and fetch is a residual risk on shared infra.
 */
export async function fetchBytesSsrfSafe(
  url: string,
  opts: {
    maxBytes?: number;
    timeoutMs?: number;
    allowedContentTypePrefixes?: string[];
  } = {},
): Promise<ArrayBuffer | null> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  let current = validateFetchUrl(url);
  if (!current) {
    log.warn("fetch_rejected_url", { reason: "invalid_or_blocked", url });
    return null;
  }

  for (let hop = 0; hop < 5; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) {
          log.warn("fetch_rejected_redirect", { url: current.toString(), reason: "no_location" });
          return null;
        }
        const next = validateFetchUrl(new URL(location, current).toString());
        if (!next) {
          log.warn("fetch_rejected_redirect", { url: current.toString(), location });
          return null;
        }
        current = next;
        continue;
      }

      if (!res.ok) return null;

      if (opts.allowedContentTypePrefixes?.length) {
        const ct = (res.headers.get("content-type") ?? "").toLowerCase();
        const ok = opts.allowedContentTypePrefixes.some((p) => ct.startsWith(p));
        if (!ok) {
          log.warn("fetch_rejected_content_type", { url: current.toString(), contentType: ct });
          return null;
        }
      }

      return await readResponseBytes(res, maxBytes);
    } catch (err) {
      log.warn("fetch_failed", {
        url: current.toString(),
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  log.warn("fetch_rejected_redirect", { url, reason: "too_many_hops" });
  return null;
}

function detectImageKind(bytes: ArrayBuffer, url: string): "png" | "jpg" | null {
  const head = new Uint8Array(bytes.slice(0, 4));
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpg";
  const lower = url.toLowerCase();
  if (lower.endsWith(".png")) return "png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpg";
  return null;
}

export async function fetchImageBytes(
  url: string,
): Promise<{ bytes: ArrayBuffer; kind: "png" | "jpg" } | null> {
  for (const { marker, bucket } of STORAGE_MARKERS) {
    if (!url.includes(marker)) continue;
    const path = extractPublicStoragePath(url, bucket);
    if (!path) continue;
    const bytes = await downloadPublicStorageObject(bucket, path);
    if (!bytes) continue;
    const kind = detectImageKind(bytes, url);
    if (kind) return { bytes, kind };
  }

  // no DNS resolution — residual SSRF (relay abuse) on fallback only, auth organizer required
  const bytes = await fetchBytesSsrfSafe(url, {
    allowedContentTypePrefixes: ["image/png", "image/jpeg", "image/jpg", "image/webp"],
    maxBytes: 5 * 1024 * 1024,
  });
  if (!bytes) return null;
  const kind = detectImageKind(bytes, url);
  if (!kind) return null;
  return { bytes, kind };
}

export async function fetchUploadedRegulationsPdf(
  uploadedUrl: string,
  tournamentId: string,
): Promise<ArrayBuffer | null> {
  if (uploadedUrl.includes("/tournament-documents/")) {
    const path = extractPublicStoragePath(uploadedUrl, "tournament-documents");
    if (!path || !isStoragePathScopedToTournament(path, tournamentId)) {
      return null;
    }
    return downloadPublicStorageObject("tournament-documents", path);
  }

  // no DNS resolution — residual SSRF (relay abuse) on fallback only, auth organizer required
  return fetchBytesSsrfSafe(uploadedUrl, {
    allowedContentTypePrefixes: ["application/pdf"],
    maxBytes: 12 * 1024 * 1024,
  });
}
