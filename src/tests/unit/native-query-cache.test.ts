import { describe, expect, it } from "vitest";

/**
 * Régression trouvée en production : `counts.get is not a function` sur
 * l'écran d'accueil.
 *
 * La persistance du cache sérialise en JSON, qui ne sait représenter ni `Map`
 * ni `Set` — il les rend en `{}`. Une requête de l'accueil renvoie
 * `{ sent: Set, counts: Map }` : restaurée, la donnée gardait la forme
 * attendue mais avait perdu ses méthodes. L'écran plantait au premier
 * lancement suivant.
 *
 * Ces entrées sont désormais écartées de la persistance : mieux vaut les
 * recharger que les ressusciter mutilées.
 */

// Reproduction de la garde, testée indépendamment du module qui touche au
// stockage — celui-ci ne s'installe qu'en natif.
function containsMapOrSet(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === null || typeof value !== "object") return false;
  if (value instanceof Map || value instanceof Set) return true;
  if (Array.isArray(value)) return value.some((v) => containsMapOrSet(v, depth + 1));
  return Object.values(value as Record<string, unknown>).some((v) =>
    containsMapOrSet(v, depth + 1),
  );
}

describe("persistance du cache — données non restaurables", () => {
  it("écarte la forme exacte qui a cassé la production", () => {
    // `home.tsx` : { sent: Set<string>, counts: Map<string, ConvocationCounts> }
    const data = { sent: new Set(["a"]), counts: new Map([["e1", { yes: 2 }]]) };
    expect(containsMapOrSet(data)).toBe(true);
  });

  it("détecte une Map imbriquée dans un tableau", () => {
    expect(containsMapOrSet({ rows: [{ byId: new Map() }] })).toBe(true);
  });

  it("laisse passer les données sérialisables", () => {
    const data = { items: [{ id: "1", n: 2 }], total: 3, at: "2026-08-07" };
    expect(containsMapOrSet(data)).toBe(false);
  });

  it("tolère null et les primitives sans lever", () => {
    for (const v of [null, undefined, 0, "", false, 42]) {
      expect(containsMapOrSet(v)).toBe(false);
    }
  });

  it("ne boucle pas indéfiniment sur une structure cyclique", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => containsMapOrSet(a)).not.toThrow();
  });
});
