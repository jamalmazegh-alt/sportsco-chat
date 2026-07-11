import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractPublicStoragePath,
  fetchBytesSsrfSafe,
  fetchImageBytes,
  fetchUploadedRegulationsPdf,
  isBlockedFetchHostname,
  isSafeHttpsUrl,
  normalizeStorageObjectPath,
} from "@/lib/safe-remote-asset.server";

const { downloadMock, storageFromMock } = vi.hoisted(() => {
  const downloadMock = vi.fn();
  const storageFromMock = vi.fn(() => ({ download: downloadMock }));
  return { downloadMock, storageFromMock };
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    storage: { from: storageFromMock },
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  downloadMock.mockReset();
  storageFromMock.mockClear();
  fetchMock.mockReset();
});

describe("normalizeStorageObjectPath", () => {
  it("rejects literal and encoded traversal", () => {
    expect(normalizeStorageObjectPath("../secret.pdf")).toBeNull();
    expect(normalizeStorageObjectPath("%2e%2e/secret.pdf")).toBeNull();
    expect(normalizeStorageObjectPath("%2e%2e%2fsecret.pdf")).toBeNull();
  });

  it("accepts valid decoded paths", () => {
    expect(normalizeStorageObjectPath("tid/regulations/a.pdf")).toBe("tid/regulations/a.pdf");
  });
});

describe("extractPublicStoragePath", () => {
  const base = "https://x.supabase.co/storage/v1/object/public/tournament-documents/";

  it("rejects cross-tournament traversal via encoded dots", () => {
    const tid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const other = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const url = `${base}${encodeURIComponent(`../${other}/regulations/x.pdf`)}`;
    const path = extractPublicStoragePath(url, "tournament-documents");
    expect(path).toBeNull();
  });

  it("rejects ../{autreId}/ literal path", () => {
    const other = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const url = `${base}../${other}/regulations/x.pdf`;
    expect(extractPublicStoragePath(url, "tournament-documents")).toBeNull();
  });
});

describe("isBlockedFetchHostname", () => {
  it("blocks loopback, link-local and metadata hosts", () => {
    expect(isBlockedFetchHostname("127.0.0.1")).toBe(true);
    expect(isBlockedFetchHostname("169.254.169.254")).toBe(true);
    expect(isBlockedFetchHostname("10.0.0.5")).toBe(true);
    expect(isBlockedFetchHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedFetchHostname("localhost")).toBe(true);
  });

  it("blocks non-dotted IP literal hostnames", () => {
    expect(isBlockedFetchHostname("2852039166")).toBe(true);
    expect(isBlockedFetchHostname("0x7f000001")).toBe(true);
    expect(isBlockedFetchHostname("017700000001")).toBe(true);
    expect(isBlockedFetchHostname("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedFetchHostname("[::ffff:169.254.169.254]")).toBe(true);
  });

  it("allows public hostnames", () => {
    expect(isBlockedFetchHostname("cdn.example.com")).toBe(false);
    expect(isBlockedFetchHostname("fcbarcelona.com")).toBe(false);
    expect(isBlockedFetchHostname("fcporto.pt")).toBe(false);
  });
});

describe("fetchBytesSsrfSafe", () => {
  it("rejects non-https and internal targets", async () => {
    expect(await fetchBytesSsrfSafe("http://example.com/x")).toBeNull();
    expect(await fetchBytesSsrfSafe("https://127.0.0.1/internal")).toBeNull();
    expect(await fetchBytesSsrfSafe("https://169.254.169.254/latest/meta-data/")).toBeNull();
    expect(await fetchBytesSsrfSafe("https://2852039166/")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects redirects to internal targets (manual redirect handling)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: "https://169.254.169.254/secret" },
      }),
    );

    const bytes = await fetchBytesSsrfSafe("https://allowed.example.com/start");
    expect(bytes).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("rejects non-matching Content-Type", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const bytes = await fetchBytesSsrfSafe("https://allowed.example.com/doc", {
      allowedContentTypePrefixes: ["application/pdf"],
    });
    expect(bytes).toBeNull();
  });
});

describe("fetchImageBytes storage-backed path", () => {
  it("downloads club logos from storage without HTTP fetch", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    downloadMock.mockResolvedValueOnce({ data: new Blob([png]), error: null });

    const url = "https://project.supabase.co/storage/v1/object/public/club-logos/club-1/logo.png";
    const result = await fetchImageBytes(url);

    expect(result?.kind).toBe("png");
    expect(storageFromMock).toHaveBeenCalledWith("club-logos");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to SSRF-safe HTTPS fetch for non-storage URLs", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fetchMock.mockResolvedValueOnce(
      new Response(png, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    const result = await fetchImageBytes("https://cdn.example.com/logo.png");
    expect(result?.kind).toBe("png");
    expect(isSafeHttpsUrl("https://cdn.example.com/logo.png")).toBe(true);
  });
});

describe("fetchUploadedRegulationsPdf", () => {
  const tid = "11111111-1111-1111-1111-111111111111";

  it("downloads tournament regulations from storage when path matches tournament", async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    downloadMock.mockResolvedValueOnce({ data: new Blob([pdf]), error: null });

    const url = `https://project.supabase.co/storage/v1/object/public/tournament-documents/${tid}/regulations/a.pdf`;

    const bytes = await fetchUploadedRegulationsPdf(url, tid);
    expect(bytes).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects encoded traversal to another tournament (no download, no fetch)", async () => {
    const other = "22222222-2222-2222-2222-222222222222";
    const url = `https://project.supabase.co/storage/v1/object/public/tournament-documents/${encodeURIComponent(`../${other}/regulations/a.pdf`)}`;

    const bytes = await fetchUploadedRegulationsPdf(url, tid);
    expect(bytes).toBeNull();
    expect(downloadMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects storage path for a different tournament id without traversal", async () => {
    const other = "22222222-2222-2222-2222-222222222222";
    const url = `https://project.supabase.co/storage/v1/object/public/tournament-documents/${other}/regulations/a.pdf`;
    const bytes = await fetchUploadedRegulationsPdf(url, tid);
    expect(bytes).toBeNull();
    expect(downloadMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
