import { describe, expect, it } from "vitest";
import { tx, txOr } from "../../../tests/e2e/_fixtures/i18n-matchers";

describe("e2e i18n matchers (tx / txOr)", () => {
  it("resolves auth + nav keys from common locales", () => {
    expect("Se connecter").toMatch(tx("auth.login"));
    expect("E-mail").toMatch(tx("auth.email"));
    expect("Équipes").toMatch(tx("nav.teams"));
  });

  it("resolves namespaced publications / camps / needs keys", () => {
    expect(tx("form.questionLabel", "publications").source.length).toBeGreaterThan(0);
    expect(tx("list.title", "camps").source.length).toBeGreaterThan(0);
    expect(tx("section.add", "needs").source.length).toBeGreaterThan(0);
  });

  it("throws on unknown keys", () => {
    expect(() => tx("this.key.does.not.exist.at.all")).toThrow(/aucune traduction/);
  });

  it("txOr falls back when key is missing", () => {
    const re = txOr("staffAvailability.title", "Mes indisponibilités");
    expect("Mes indisponibilités").toMatch(re);
  });
});
