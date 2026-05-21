import { describe, it, expect, vi, beforeEach } from "vitest";
import { humanizeError } from "@/lib/humanize-error";

vi.mock("@/lib/i18n", () => ({
  default: {
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("humanizeError — erreurs d'authentification", () => {
  it("identifie les credentials invalides", () => {
    const msg = humanizeError(new Error("Invalid login credentials"));
    expect(msg).toMatch(/incorrect|invalide/i);
  });

  it("identifie email non confirmé", () => {
    const msg = humanizeError(new Error("email not confirmed"));
    expect(msg).toMatch(/confirm/i);
  });

  it("identifie email déjà utilisé", () => {
    const msg = humanizeError(new Error("User already registered"));
    expect(msg).toMatch(/déjà utilisée|already/i);
  });

  it("identifie mot de passe trop court", () => {
    const msg = humanizeError(new Error("Password should be at least 6 characters"));
    expect(msg).toMatch(/court|short/i);
  });

  it("identifie le rate limiting", () => {
    const msg = humanizeError(new Error("rate limit exceeded"));
    expect(msg).toMatch(/tentative|rate/i);
  });

  it("identifie too many requests", () => {
    const msg = humanizeError(new Error("too many requests"));
    expect(msg).toMatch(/tentative|rate/i);
  });
});

describe("humanizeError — erreurs RLS et permissions", () => {
  it("identifie row-level security", () => {
    const msg = humanizeError(new Error("new row violates row-level security policy"));
    expect(msg).toMatch(/droit|permission|autoris/i);
  });

  it("identifie permission denied", () => {
    const msg = humanizeError(new Error("permission denied for table events"));
    expect(msg).toMatch(/droit|permission/i);
  });

  it("identifie not authorized", () => {
    const msg = humanizeError(new Error("not authorized"));
    expect(msg).toMatch(/droit|permission/i);
  });

  it("identifie unauthorized", () => {
    const msg = humanizeError(new Error("unauthorized access"));
    expect(msg).toMatch(/droit|permission/i);
  });
});

describe("humanizeError — erreurs Postgres", () => {
  it("identifie duplicate key (contrainte unique)", () => {
    const msg = humanizeError(new Error("duplicate key value violates unique constraint"));
    expect(msg).toMatch(/déjà|existe|duplicate/i);
  });

  it("identifie unique constraint", () => {
    const msg = humanizeError(new Error("unique constraint violation"));
    expect(msg).toMatch(/déjà|existe/i);
  });

  it("identifie foreign key violation", () => {
    const msg = humanizeError(new Error("foreign key violation on table players"));
    expect(msg).toMatch(/référenc/i);
  });

  it("identifie not-null violation", () => {
    const msg = humanizeError(new Error("violates not-null constraint"));
    expect(msg).toMatch(/manquant|obligatoire/i);
  });

  it("identifie check constraint", () => {
    const msg = humanizeError(new Error("violates check constraint player_rating"));
    expect(msg).toMatch(/valide|valeur/i);
  });
});

describe("humanizeError — erreurs d'invitations", () => {
  it("identifie invite expired", () => {
    const msg = humanizeError(new Error("invite expired"));
    expect(msg).toMatch(/expir/i);
  });

  it("identifie invite already used", () => {
    const msg = humanizeError(new Error("invite already used"));
    expect(msg).toMatch(/utilisée|used/i);
  });

  it("identifie invalid invite", () => {
    const msg = humanizeError(new Error("invalid invite token"));
    expect(msg).toMatch(/invalide|invalid/i);
  });
});

describe("humanizeError — erreurs réseau", () => {
  it("identifie failed to fetch", () => {
    const msg = humanizeError(new Error("failed to fetch"));
    expect(msg).toMatch(/connexion|réseau|network/i);
  });

  it("identifie network error", () => {
    const msg = humanizeError(new Error("network request failed"));
    expect(msg).toMatch(/connexion|réseau|network/i);
  });

  it("identifie timeout", () => {
    const msg = humanizeError(new Error("request timeout"));
    expect(msg).toMatch(/temps|timeout/i);
  });

  it("identifie not found", () => {
    const msg = humanizeError(new Error("resource not found"));
    expect(msg).toMatch(/introuvable|found/i);
  });
});

describe("humanizeError — erreurs de stockage", () => {
  it("identifie payload too large", () => {
    const msg = humanizeError(new Error("payload too large"));
    expect(msg).toMatch(/volumineux|large/i);
  });

  it("identifie file too large", () => {
    const msg = humanizeError(new Error("file too large"));
    expect(msg).toMatch(/volumineux|large/i);
  });
});

describe("humanizeError — types d'entrée", () => {
  it("accepte une string directement", () => {
    const msg = humanizeError("rate limit exceeded");
    expect(msg).toMatch(/tentative|rate/i);
  });

  it("accepte un objet avec .message", () => {
    const msg = humanizeError({ message: "duplicate key value" });
    expect(msg).toMatch(/déjà|existe/i);
  });

  it("accepte un objet avec .error_description", () => {
    const msg = humanizeError({ error_description: "email not confirmed" });
    expect(msg).toMatch(/confirm/i);
  });

  it("gère null sans planter", () => {
    const msg = humanizeError(null);
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });

  it("gère undefined sans planter", () => {
    const msg = humanizeError(undefined);
    expect(typeof msg).toBe("string");
  });

  it("utilise le fallback fourni si rien ne matche", () => {
    const msg = humanizeError({ message: "xY_zk_unknown_9q2" }, "Message de fallback");
    expect(msg).toBe("Message de fallback");
  });

  it("retourne toujours une chaîne non vide", () => {
    const inputs = [null, undefined, "", {}, new Error(""), "unknown_xyz_error"];
    for (const input of inputs) {
      const msg = humanizeError(input);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});

describe("humanizeError — messages ambigus", () => {
  it("ne retourne pas de JSON brut pour les objets complexes", () => {
    const msg = humanizeError({ code: "PGRST301", details: "some_snake_case_detail", hint: null });
    expect(msg).not.toContain("{");
  });

  it("retourne le message brut s'il est court et lisible", () => {
    const msg = humanizeError(new Error("Service temporairement indisponible"));
    expect(msg).toBe("Service temporairement indisponible");
  });
});
