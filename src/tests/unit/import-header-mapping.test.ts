/**
 * Regression tests for header → Clubero-field mapping in the super-admin import.
 *
 * These tests exercise the pure `parseTemplate` pipeline with the header
 * variants we see in real user files (French labels with/without accents,
 * spaces vs underscores, `N°`, `Prénom parent 1`, etc.). They guard against
 * regressions like the one where the pre-mapping normalization stripped
 * spaces but kept underscores, so `Prenom joueur` no longer matched
 * `prenom_joueur` and files ended up with 0 mapped columns.
 */
import { describe, it, expect } from "vitest";
import { parseTemplate } from "@/lib/superadmin-import/template-parse";
import { templateMatchRatio } from "@/lib/superadmin-import/schemas";

describe("parseTemplate — header mapping (players)", () => {
  it("maps French labels with spaces to underscored keys (real file shape)", () => {
    const headers = [
      "Équipe",
      "Sport",
      "Catégorie",
      "Prenom joueur",
      "Nom joueur",
      "Date naissance",
      "N° maillot",
      "N° licence",
      "Poste préféré",
      "Prénom parent 1",
      "Email parent 1",
      "Téléphone parent 1",
    ];
    const rows = [
      {
        Équipe: "U15 R1",
        Sport: "football",
        Catégorie: "U15",
        "Prenom joueur": "Lucas",
        "Nom joueur": "Martin",
        "Date naissance": "2009-02-02",
        "N° maillot": "10",
        "N° licence": "U1700001",
        "Poste préféré": "GK",
        "Prénom parent 1": "Sophie",
        "Email parent 1": "sophie@example.com",
        "Téléphone parent 1": "+33600000001",
      },
    ];
    const res = parseTemplate("players", headers, rows);
    // Every source header must be mapped to a Clubero key.
    expect(res.mapping).toMatchObject({
      Équipe: "equipe",
      Sport: "sport",
      Catégorie: "categorie",
      "Prenom joueur": "prenom_joueur",
      "Nom joueur": "nom_joueur",
      "Date naissance": "date_naissance",
      "N° maillot": "numero_maillot",
      "N° licence": "numero_licence",
      "Poste préféré": "poste",
      "Prénom parent 1": "prenom_parent_1",
      "Email parent 1": "email_parent_1",
      "Téléphone parent 1": "telephone_parent_1",
    });
    expect(res.rows[0].prenom_joueur.value).toBe("Lucas");
    expect(res.rows[0].date_naissance.value).toBe("2009-02-02");
    expect(res.summary.valid).toBe(1);
    expect(res.summary.to_fix).toBe(0);
  });

  it("maps canonical technical keys as well (equipe / prenom_joueur / …)", () => {
    const headers = [
      "equipe",
      "sport",
      "categorie",
      "prenom_joueur",
      "nom_joueur",
      "date_naissance",
    ];
    const rows = [
      {
        equipe: "U15",
        sport: "football",
        categorie: "U15",
        prenom_joueur: "Alice",
        nom_joueur: "Doe",
        date_naissance: "2010-01-01",
      },
    ];
    const res = parseTemplate("players", headers, rows);
    expect(Object.values(res.mapping)).toEqual(
      expect.arrayContaining(["equipe", "prenom_joueur", "nom_joueur", "date_naissance"]),
    );
    expect(res.summary.valid).toBe(1);
  });

  it("is resilient to casse, accents stripped, and asterisk suffix on required cols", () => {
    const headers = [
      "EQUIPE*",
      "SPORT",
      "categorie*",
      "PRENOM JOUEUR*",
      "NOM JOUEUR*",
      "date de naissance*",
    ];
    const rows = [
      {
        "EQUIPE*": "U13",
        SPORT: "football",
        "categorie*": "U13",
        "PRENOM JOUEUR*": "Bob",
        "NOM JOUEUR*": "Smith",
        "date de naissance*": "2012-06-01",
      },
    ];
    const res = parseTemplate("players", headers, rows);
    // Note: the pipeline strips `*` only on the AI-side pre-mapping; the pure
    // parseTemplate uses NFD + alnum-only, which naturally drops `*`.
    expect(res.mapping["PRENOM JOUEUR*"]).toBe("prenom_joueur");
    expect(res.mapping["NOM JOUEUR*"]).toBe("nom_joueur");
    expect(res.mapping["date de naissance*"]).toBe("date_naissance");
  });

  it("maps human-written variants for jersey & licence numbers", () => {
    // Variants like `N° de maillot`, `Numéro de licence`, `# maillot`, `num
    // de licence`, `Jersey number`, `License #` regressed silently before the
    // shared normalizeHeader with token synonyms.
    const headers = [
      "Équipe",
      "Sport",
      "Catégorie",
      "Prénom joueur",
      "Nom joueur",
      "Date de naissance",
      "N° de maillot",
      "Numéro de licence",
    ];
    const rows = [
      {
        Équipe: "U15",
        Sport: "football",
        Catégorie: "U15",
        "Prénom joueur": "Lucas",
        "Nom joueur": "Martin",
        "Date de naissance": "2009-02-02",
        "N° de maillot": "10",
        "Numéro de licence": "U1700001",
      },
    ];
    const res = parseTemplate("players", headers, rows);
    expect(res.mapping["N° de maillot"]).toBe("numero_maillot");
    expect(res.mapping["Numéro de licence"]).toBe("numero_licence");

    // Also cover EN + hash-based variants.
    const res2 = parseTemplate(
      "players",
      ["Jersey number", "License #"],
      [{ "Jersey number": "7", "License #": "ABC" }],
    );
    expect(res2.mapping["Jersey number"]).toBe("numero_maillot");
    expect(res2.mapping["License #"]).toBe("numero_licence");

    // And `num` / `n°` short forms.
    const res3 = parseTemplate(
      "players",
      ["num maillot", "n° licence"],
      [{ "num maillot": "7", "n° licence": "ABC" }],
    );
    expect(res3.mapping["num maillot"]).toBe("numero_maillot");
    expect(res3.mapping["n° licence"]).toBe("numero_licence");
  });
});

describe("parseTemplate — header mapping (coaches)", () => {
  it("maps standard coach headers (French labels)", () => {
    const headers = ["Équipe", "Sport", "Catégorie", "Prénom", "Nom", "Email", "Rôle"];
    const rows = [
      {
        Équipe: "U15",
        Sport: "football",
        Catégorie: "U15",
        Prénom: "Coach",
        Nom: "Dupont",
        Email: "coach@example.com",
        Rôle: "coach",
      },
    ];
    const res = parseTemplate("coaches", headers, rows);
    expect(res.mapping).toMatchObject({
      Équipe: "equipe",
      Prénom: "prenom",
      Nom: "nom",
      Email: "email",
      Rôle: "role",
    });
    expect(res.summary.valid).toBe(1);
  });
});

describe("parseTemplate — header mapping (planning)", () => {
  it("maps standard planning headers with accented labels", () => {
    const headers = ["Équipe", "Type", "Date début", "Heure début", "Heure fin", "Lieu"];
    const rows = [
      {
        Équipe: "U15",
        Type: "Entraînement",
        "Date début": "2026-09-01",
        "Heure début": "18:00",
        "Heure fin": "19:30",
        Lieu: "Stade",
      },
    ];
    const res = parseTemplate("planning", headers, rows);
    expect(res.mapping).toMatchObject({
      "Date début": "date_debut",
      "Heure début": "heure_debut",
      "Heure fin": "heure_fin",
    });
    expect(res.summary.valid).toBe(1);
  });
});

describe("templateMatchRatio — required-field detection", () => {
  it("reaches 100% when all required labels are present (players)", () => {
    const headers = [
      "Équipe",
      "Sport",
      "Catégorie",
      "Prénom joueur",
      "Nom joueur",
      "Date de naissance",
    ];
    expect(templateMatchRatio(headers, "players")).toBe(1);
  });

  it("reaches 100% when required technical keys are used (players)", () => {
    const headers = [
      "equipe",
      "sport",
      "categorie",
      "prenom_joueur",
      "nom_joueur",
      "date_naissance",
    ];
    expect(templateMatchRatio(headers, "players")).toBe(1);
  });

  it("degrades gracefully when only some required cols are present", () => {
    const headers = ["Prénom joueur", "Nom joueur", "Date naissance"];
    const ratio = templateMatchRatio(headers, "players");
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
  });
});
