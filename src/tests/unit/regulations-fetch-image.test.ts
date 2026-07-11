import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchImage, buildRegulationsPdf } from "@/routes/api/public/tournament.$id.regulations";
import { mergeRules } from "@/modules/tournaments/lib/rules";

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

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeEach(() => {
  downloadMock.mockReset();
  storageFromMock.mockClear();
  fetchMock.mockReset();
});

describe("regulations fetchImage (SSRF-safe via fetchImageBytes)", () => {
  it("blocks cover metadata IP 169.254.169.254 — returns null, no fetch", async () => {
    const result = await fetchImage("https://169.254.169.254/latest/meta-data/");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks private IP cover (10.x) — returns null", async () => {
    const result = await fetchImage("https://10.0.0.5/internal");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks cover with redirect to internal IP (redirect: manual)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: "https://169.254.169.254/secret" },
      }),
    );

    const result = await fetchImage("https://allowed.example.com/cover.jpg");
    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("does not block fcbarcelona.com (fc/fd false positive regression)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(PNG, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    const result = await fetchImage("https://fcbarcelona.com/assets/logo.png");
    expect(result?.kind).toBe("png");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches legitimate external cover image", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(PNG, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    const result = await fetchImage("https://cdn.example.com/tournament-cover.png");
    expect(result?.kind).toBe("png");
    expect(result?.bytes.byteLength).toBe(PNG.byteLength);
  });

  it("fetches storage-backed club logo without HTTP fetch", async () => {
    downloadMock.mockResolvedValueOnce({ data: new Blob([PNG]), error: null });

    const url = "https://project.supabase.co/storage/v1/object/public/club-logos/club-1/logo.png";
    const result = await fetchImage(url);

    expect(result?.kind).toBe("png");
    expect(storageFromMock).toHaveBeenCalledWith("club-logos");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("regulations PDF with blocked/missing images", () => {
  const tournament = {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Test Cup",
    slug: "test-cup",
    sport: "football",
    category: "U15",
    starts_on: "2026-07-01",
    ends_on: null,
    location: "Paris",
    format: "group",
    num_teams: 8,
    points_win: 3,
    points_draw: 1,
    points_loss: 0,
    tiebreakers: ["points"],
    settings: {},
  };

  it("renders PDF when tournament logo is null (blocked cover)", async () => {
    const pdf = await buildRegulationsPdf(
      tournament,
      mergeRules(tournament.settings),
      "fr",
      null,
      null,
      null,
    );
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
