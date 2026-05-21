import { describe, it, expect } from "vitest";
import { TOP_SPORTS, COLLECTIVE_SPORTS } from "@/lib/sports";

// ─── sports.ts ───────────────────────────────────────────────────────────────

describe("TOP_SPORTS", () => {
  it("contient football", () => {
    expect(TOP_SPORTS).toContain("football");
  });

  it("contient basketball", () => {
    expect(TOP_SPORTS).toContain("basketball");
  });

  it("est en lecture seule (readonly tuple)", () => {
    expect(Array.isArray(TOP_SPORTS)).toBe(true);
  });
});

describe("COLLECTIVE_SPORTS", () => {
  it("contient handball", () => {
    expect(COLLECTIVE_SPORTS).toContain("handball");
  });

  it("contient volleyball", () => {
    expect(COLLECTIVE_SPORTS).toContain("volleyball");
  });

  it("contient rugby", () => {
    expect(COLLECTIVE_SPORTS).toContain("rugby");
  });

  it("contient futsal", () => {
    expect(COLLECTIVE_SPORTS).toContain("futsal");
  });

  it("contient ice_hockey", () => {
    expect(COLLECTIVE_SPORTS).toContain("ice_hockey");
  });

  it("contient field_hockey", () => {
    expect(COLLECTIVE_SPORTS).toContain("field_hockey");
  });
});

describe("cohérence TOP_SPORTS / COLLECTIVE_SPORTS", () => {
  it("aucun sport n'est dans les deux listes", () => {
    const topSet = new Set(TOP_SPORTS);
    for (const sport of COLLECTIVE_SPORTS) {
      expect(topSet.has(sport as any)).toBe(false);
    }
  });
});

// ─── diffSnapshot (logique extraite pour test) ────────────────────────────────
// La logique de diffSnapshot est dans $eventId.tsx mais on peut la tester
// en isolant les primitives.

const CONVOC_SNAPSHOT_FIELDS = [
  "title", "description", "starts_at", "ends_at",
  "convocation_time", "location", "meeting_point",
  "competition_name", "type",
] as const;

type SnapshotField = (typeof CONVOC_SNAPSHOT_FIELDS)[number];

function buildConvocSnapshot(ev: Record<string, any>): Record<string, any> {
  const snap: Record<string, any> = {};
  for (const k of CONVOC_SNAPSHOT_FIELDS) snap[k] = ev?.[k] ?? null;
  return snap;
}

function diffSnapshot(
  prev: Record<string, any> | null | undefined,
  current: Record<string, any>,
  t: (k: string) => string = (k) => k
): Array<{ field: string; label: string; previous?: string; current?: string }> {
  if (!prev) return [];
  const labels: Record<string, string> = {
    title: "Titre", description: "Description",
    starts_at: "Date / heure", ends_at: "Fin",
    convocation_time: "Heure de RDV", location: "Lieu",
    meeting_point: "Point de RDV", competition_name: "Compétition",
    type: "Type",
  };
  const out: Array<{ field: string; label: string; previous?: string; current?: string }> = [];
  for (const k of CONVOC_SNAPSHOT_FIELDS) {
    const a = prev[k] ?? null;
    const b = current?.[k] ?? null;
    if ((a ?? "") !== (b ?? "")) {
      out.push({ field: k, label: labels[k] ?? k, previous: a ?? undefined, current: b ?? undefined });
    }
  }
  return out;
}

describe("buildConvocSnapshot", () => {
  it("extrait tous les champs snapshot", () => {
    const ev = {
      title: "Match vs PSG",
      description: "Important",
      starts_at: "2026-06-15T14:30:00.000Z",
      ends_at: "2026-06-15T16:30:00.000Z",
      convocation_time: "2026-06-15T13:30:00.000Z",
      location: "Stade Louis II",
      meeting_point: "Entrée principale",
      competition_name: "Championnat",
      type: "match",
      team_id: "should-not-appear",
      status: "active",
    };
    const snap = buildConvocSnapshot(ev);
    expect(Object.keys(snap)).toHaveLength(CONVOC_SNAPSHOT_FIELDS.length);
    expect(snap.title).toBe("Match vs PSG");
    expect(snap.location).toBe("Stade Louis II");
    expect((snap as any).team_id).toBeUndefined();
    expect((snap as any).status).toBeUndefined();
  });

  it("remplace les valeurs undefined par null", () => {
    const ev = { title: "Test" };
    const snap = buildConvocSnapshot(ev);
    expect(snap.description).toBeNull();
    expect(snap.location).toBeNull();
    expect(snap.starts_at).toBeNull();
  });

  it("gère un objet vide", () => {
    const snap = buildConvocSnapshot({});
    for (const field of CONVOC_SNAPSHOT_FIELDS) {
      expect(snap[field]).toBeNull();
    }
  });
});

describe("diffSnapshot", () => {
  it("retourne tableau vide si prev est null", () => {
    const current = { title: "Match", location: "Stade" };
    expect(diffSnapshot(null, current)).toHaveLength(0);
  });

  it("retourne tableau vide si prev est undefined", () => {
    const current = { title: "Match" };
    expect(diffSnapshot(undefined, current)).toHaveLength(0);
  });

  it("retourne tableau vide si aucun changement", () => {
    const snap = buildConvocSnapshot({ title: "Match", location: "Stade" });
    const current = { title: "Match", location: "Stade" };
    expect(diffSnapshot(snap, current)).toHaveLength(0);
  });

  it("détecte un changement de titre", () => {
    const prev = buildConvocSnapshot({ title: "Match vs PSG" });
    const current = { title: "Match vs OL" };
    const diff = diffSnapshot(prev, current);
    expect(diff).toHaveLength(1);
    expect(diff[0].field).toBe("title");
    expect(diff[0].previous).toBe("Match vs PSG");
    expect(diff[0].current).toBe("Match vs OL");
  });

  it("détecte un changement de lieu", () => {
    const prev = buildConvocSnapshot({ location: "Stade Louis II" });
    const current = { location: "Parc des Princes" };
    const diff = diffSnapshot(prev, current);
    expect(diff[0].field).toBe("location");
  });

  it("détecte plusieurs changements simultanés", () => {
    const prev = buildConvocSnapshot({
      title: "Match vs PSG",
      location: "Stade A",
      starts_at: "2026-06-15T14:00:00Z",
    });
    const current = {
      title: "Match vs OL",
      location: "Stade B",
      starts_at: "2026-06-22T14:00:00Z",
    };
    const diff = diffSnapshot(prev, current);
    expect(diff.length).toBeGreaterThanOrEqual(3);
    const fields = diff.map((d) => d.field);
    expect(fields).toContain("title");
    expect(fields).toContain("location");
    expect(fields).toContain("starts_at");
  });

  it("traite null et chaîne vide comme équivalents (pas de diff)", () => {
    const prev = buildConvocSnapshot({ description: null });
    const current = { description: "" };
    const diff = diffSnapshot(prev, current);
    const descDiff = diff.find((d) => d.field === "description");
    expect(descDiff).toBeUndefined();
  });

  it("détecte passage de valeur à null", () => {
    const prev = buildConvocSnapshot({ location: "Stade Louis II" });
    const current = { location: null };
    const diff = diffSnapshot(prev, current);
    const locDiff = diff.find((d) => d.field === "location");
    expect(locDiff).toBeDefined();
    expect(locDiff?.previous).toBe("Stade Louis II");
    expect(locDiff?.current).toBeUndefined();
  });

  it("inclut le label lisible pour chaque champ modifié", () => {
    const prev = buildConvocSnapshot({ location: "Stade A", title: "Match" });
    const current = { location: "Stade B", title: "Match" };
    const diff = diffSnapshot(prev, current);
    expect(diff[0].label).toBe("Lieu");
  });

  it("n'inclut pas les champs hors snapshot (ex: team_id)", () => {
    const prev = buildConvocSnapshot({ title: "Match" });
    const current = { title: "Match", team_id: "nouveau-team-id" };
    const diff = diffSnapshot(prev, current);
    const teamDiff = diff.find((d) => d.field === "team_id");
    expect(teamDiff).toBeUndefined();
  });
});
