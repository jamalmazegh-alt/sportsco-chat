import { describe, it, expect } from "vitest";
import {
  computeOpenNeedUrgencies,
  severityForStart,
  type OpenNeedInput,
} from "./use-need-urgencies";
import { mergeUrgencies } from "./pure";
import type { UrgencyRole } from "./types";

const NOW = new Date("2025-07-20T10:00:00.000Z");

function inMs(ms: number): string {
  return new Date(NOW.getTime() + ms).toISOString();
}

const H = 60 * 60 * 1000;
const D = 24 * H;

function makeNeed(overrides: Partial<OpenNeedInput> = {}): OpenNeedInput {
  return {
    id: "need-1",
    status: "open",
    capacity: 2,
    remaining_seats: 2,
    role_key: "delegate",
    label: "Délégué de match",
    my_signup: null,
    events: {
      id: "event-1",
      title: "U15 vs ESAP Metz",
      starts_at: inMs(3 * D),
    },
    ...overrides,
  };
}

const args = {
  role: "parent" as UrgencyRole,
  now: NOW,
  formatWhen: (iso: string) => `WHEN(${iso.slice(0, 10)})`,
  labelForRole: (k: string) => `role:${k}`,
  seatsSuffix: (n: number) => (n > 1 ? ` · ${n} places` : ""),
  fallbackTitle: "Coup de main",
};

describe("severityForStart", () => {
  it("critical si < 48h", () => {
    expect(severityForStart(inMs(24 * H), NOW)).toBe("critical");
    expect(severityForStart(inMs(47 * H), NOW)).toBe("critical");
  });
  it("high si < 7j", () => {
    expect(severityForStart(inMs(3 * D), NOW)).toBe("high");
    expect(severityForStart(inMs(6 * D + 23 * H), NOW)).toBe("high");
  });
  it("medium au-delà de 7j", () => {
    expect(severityForStart(inMs(10 * D), NOW)).toBe("medium");
  });
  it("null si passé ou démarré", () => {
    expect(severityForStart(inMs(-H), NOW)).toBeNull();
    expect(severityForStart(inMs(0), NOW)).toBeNull();
  });
});

describe("computeOpenNeedUrgencies — périmètre", () => {
  it("émet 1 item pour un destinataire sans signup avec place libre", () => {
    const items = computeOpenNeedUrgencies({ needs: [makeNeed()], ...args });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("open-need:need-1:parent");
    expect(items[0].primaryAction).toEqual({
      kind: "open-need",
      needId: "need-1",
      eventId: "event-1",
    });
    expect(items[0].source).toBe("open-need");
    expect(items[0].sourceId).toBe("need-1");
  });

  it("n'émet PAS d'item si applied", () => {
    const n = makeNeed({ my_signup: { status: "applied" } });
    expect(computeOpenNeedUrgencies({ needs: [n], ...args })).toHaveLength(0);
  });

  it("n'émet PAS d'item si confirmed", () => {
    const n = makeNeed({ my_signup: { status: "confirmed" } });
    expect(computeOpenNeedUrgencies({ needs: [n], ...args })).toHaveLength(0);
  });

  it("n'émet PAS d'item si unavailable (Pas dispo = réponse)", () => {
    const n = makeNeed({ my_signup: { status: "unavailable" } });
    expect(computeOpenNeedUrgencies({ needs: [n], ...args })).toHaveLength(0);
  });

  it("n'émet PAS d'item si withdrawn", () => {
    const n = makeNeed({ my_signup: { status: "withdrawn" } });
    expect(computeOpenNeedUrgencies({ needs: [n], ...args })).toHaveLength(0);
  });

  it("n'émet PAS d'item si declined", () => {
    const n = makeNeed({ my_signup: { status: "declined" } });
    expect(computeOpenNeedUrgencies({ needs: [n], ...args })).toHaveLength(0);
  });

  it("n'émet PAS d'item si besoin complet (remaining_seats=0)", () => {
    const n = makeNeed({ remaining_seats: 0 });
    expect(computeOpenNeedUrgencies({ needs: [n], ...args })).toHaveLength(0);
  });

  it("n'émet PAS d'item si status ≠ open (closed, cancelled, draft)", () => {
    for (const status of ["closed", "cancelled", "draft"]) {
      const n = makeNeed({ status });
      expect(computeOpenNeedUrgencies({ needs: [n], ...args })).toHaveLength(0);
    }
  });

  it("n'émet PAS d'item si événement passé/démarré", () => {
    const n = makeNeed({ events: { id: "e1", title: "past", starts_at: inMs(-H) } });
    expect(computeOpenNeedUrgencies({ needs: [n], ...args })).toHaveLength(0);
  });

  it("n'émet PAS d'item si events est null (besoin orphelin)", () => {
    const n = makeNeed({ events: null });
    expect(computeOpenNeedUrgencies({ needs: [n], ...args })).toHaveLength(0);
  });
});

describe("computeOpenNeedUrgencies — sévérité", () => {
  it("24h → critical", () => {
    const n = makeNeed({ events: { id: "e", title: "t", starts_at: inMs(24 * H) } });
    expect(computeOpenNeedUrgencies({ needs: [n], ...args })[0].severity).toBe("critical");
  });
  it("3j → high", () => {
    const n = makeNeed({ events: { id: "e", title: "t", starts_at: inMs(3 * D) } });
    expect(computeOpenNeedUrgencies({ needs: [n], ...args })[0].severity).toBe("high");
  });
  it("10j → medium", () => {
    const n = makeNeed({ events: { id: "e", title: "t", starts_at: inMs(10 * D) } });
    expect(computeOpenNeedUrgencies({ needs: [n], ...args })[0].severity).toBe("medium");
  });
});

describe("computeOpenNeedUrgencies — dédup & id", () => {
  it("deux entrées même needId → un seul item (dédup interne)", () => {
    const n1 = makeNeed({ id: "n1" });
    const n2 = makeNeed({ id: "n1" });
    const items = computeOpenNeedUrgencies({ needs: [n1, n2], ...args });
    expect(items).toHaveLength(1);
  });

  it("id suit la convention `open-need:${needId}:${role}`", () => {
    const items = computeOpenNeedUrgencies({
      needs: [makeNeed({ id: "abc" })],
      ...args,
      role: "coach",
    });
    expect(items[0].id).toBe("open-need:abc:coach");
  });
});

describe("computeOpenNeedUrgencies — libellés", () => {
  it("subtitle inclut match + date + places restantes si >1", () => {
    const n = makeNeed({ remaining_seats: 3 });
    const items = computeOpenNeedUrgencies({ needs: [n], ...args });
    expect(items[0].subtitle).toContain("U15 vs ESAP Metz");
    expect(items[0].subtitle).toContain("3 places");
  });
  it("subtitle sans mention de places si 1 seule restante", () => {
    const n = makeNeed({ remaining_seats: 1 });
    const items = computeOpenNeedUrgencies({ needs: [n], ...args });
    expect(items[0].subtitle).not.toContain("places");
  });
  it("title fallback sur le rôle si label vide", () => {
    const n = makeNeed({ label: "" });
    const items = computeOpenNeedUrgencies({ needs: [n], ...args });
    expect(items[0].title).toBe("role:delegate");
  });
});

describe("intégration mergeUrgencies", () => {
  it("besoin critical + convocation medium → tri severity DESC", () => {
    const need = computeOpenNeedUrgencies({
      needs: [
        makeNeed({ id: "need-crit", events: { id: "e1", title: "e1", starts_at: inMs(12 * H) } }),
      ],
      ...args,
    });
    const other = {
      id: "convocation-silence:e2:parent",
      source: "convocation-silence" as const,
      sourceId: "e2",
      severity: "medium" as const,
      role: "parent" as const,
      title: "e2",
      subtitle: "",
      anchorAt: inMs(5 * D),
      primaryAction: { kind: "respond" as const, eventId: "e2" },
    };
    const out = mergeUrgencies([need, [other]]);
    expect(out[0].severity).toBe("critical");
    expect(out[1].severity).toBe("medium");
  });

  it("collision d'id entre sources (impossible en pratique) → dédup", () => {
    // Sanity : mergeUrgencies dédup sur id ; deux items open-need identiques
    // provenant de deux tableaux → 1 seul.
    const a = computeOpenNeedUrgencies({ needs: [makeNeed()], ...args });
    const b = computeOpenNeedUrgencies({ needs: [makeNeed()], ...args });
    const out = mergeUrgencies([a, b]);
    expect(out).toHaveLength(1);
  });
});
