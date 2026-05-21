import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv — cas de base", () => {
  it("génère un CSV avec header et une ligne", () => {
    const rows = [{ name: "Dupont", score: 10 }];
    const cols = [
      { key: "name" as const, header: "Nom" },
      { key: "score" as const, header: "Score" },
    ];
    const csv = toCsv(rows, cols);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Nom,Score");
    expect(lines[1]).toBe("Dupont,10");
  });

  it("génère un CSV avec plusieurs lignes", () => {
    const rows = [
      { first: "Jean", last: "Dupont", status: "present" },
      { first: "Pierre", last: "Martin", status: "absent" },
    ];
    const cols = [
      { key: "last" as const, header: "Nom" },
      { key: "first" as const, header: "Prénom" },
      { key: "status" as const, header: "Statut" },
    ];
    const csv = toCsv(rows, cols);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Nom,Prénom,Statut");
    expect(lines[1]).toBe("Dupont,Jean,present");
    expect(lines[2]).toBe("Martin,Pierre,absent");
  });

  it("tableau vide retourne seulement le header", () => {
    const cols = [{ key: "name" as const, header: "Nom" }];
    const csv = toCsv([], cols);
    expect(csv).toBe("Nom");
  });

  it("sépare les colonnes avec des virgules", () => {
    const rows = [{ a: "x", b: "y", c: "z" }];
    const cols = [
      { key: "a" as const, header: "A" },
      { key: "b" as const, header: "B" },
      { key: "c" as const, header: "C" },
    ];
    const csv = toCsv(rows, cols);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toBe("x,y,z");
  });
});

describe("toCsv — échappement RFC 4180", () => {
  it("entoure de guillemets les valeurs contenant une virgule", () => {
    const rows = [{ name: "Dupont, Jean" }];
    const cols = [{ key: "name" as const, header: "Nom" }];
    const csv = toCsv(rows, cols);
    expect(csv.split("\r\n")[1]).toBe('"Dupont, Jean"');
  });

  it("double les guillemets dans les valeurs", () => {
    const rows = [{ name: 'Il a dit "bonjour"' }];
    const cols = [{ key: "name" as const, header: "Nom" }];
    const csv = toCsv(rows, cols);
    expect(csv.split("\r\n")[1]).toBe('"Il a dit ""bonjour"""');
  });

  it("entoure de guillemets les valeurs avec des sauts de ligne", () => {
    const rows = [{ comment: "Ligne 1\nLigne 2" }];
    const cols = [{ key: "comment" as const, header: "Commentaire" }];
    const csv = toCsv(rows, cols);
    expect(csv.split("\r\n")[1]).toBe('"Ligne 1\nLigne 2"');
  });

  it("n'entoure pas de guillemets les valeurs simples", () => {
    const rows = [{ name: "Dupont" }];
    const cols = [{ key: "name" as const, header: "Nom" }];
    const csv = toCsv(rows, cols);
    expect(csv.split("\r\n")[1]).toBe("Dupont");
  });

  it("gère les guillemets dans le header", () => {
    const rows = [{ val: "test" }];
    const cols = [{ key: "val" as const, header: 'Col "A"' }];
    const csv = toCsv(rows, cols);
    expect(csv.split("\r\n")[0]).toBe('"Col ""A"""');
  });
});

describe("toCsv — types de valeurs", () => {
  it("convertit les nombres en chaînes", () => {
    const rows = [{ score: 42, rating: 3.14 }];
    const cols = [
      { key: "score" as const, header: "Score" },
      { key: "rating" as const, header: "Note" },
    ];
    const csv = toCsv(rows, cols);
    const line = csv.split("\r\n")[1];
    expect(line).toBe("42,3.14");
  });

  it("convertit null en chaîne vide", () => {
    const rows = [{ name: "Dupont", comment: null as unknown as string }];
    const cols = [
      { key: "name" as const, header: "Nom" },
      { key: "comment" as const, header: "Commentaire" },
    ];
    const csv = toCsv(rows, cols);
    expect(csv.split("\r\n")[1]).toBe("Dupont,");
  });

  it("convertit undefined en chaîne vide", () => {
    const rows = [{ name: "Dupont", extra: undefined as unknown as string }];
    const cols = [
      { key: "name" as const, header: "Nom" },
      { key: "extra" as const, header: "Extra" },
    ];
    const csv = toCsv(rows, cols);
    expect(csv.split("\r\n")[1]).toBe("Dupont,");
  });

  it("gère les caractères accentués sans modification", () => {
    const rows = [{ name: "Élodie Müller" }];
    const cols = [{ key: "name" as const, header: "Prénom" }];
    const csv = toCsv(rows, cols);
    expect(csv.split("\r\n")[1]).toBe("Élodie Müller");
  });
});

describe("toCsv — cas réel : export présences", () => {
  it("génère le bon CSV pour une liste de présences", () => {
    const rows = [
      { last_name: "Dupont", first_name: "Jean", jersey_number: 7, status: "present", comment: "" },
      { last_name: "Martin", first_name: "Pierre", jersey_number: 11, status: "absent", comment: "Blessure, genou" },
      { last_name: "Hassan", first_name: "Ali", jersey_number: 3, status: "pending", comment: "" },
    ];
    const cols = [
      { key: "last_name" as const, header: "Nom" },
      { key: "first_name" as const, header: "Prénom" },
      { key: "jersey_number" as const, header: "#" },
      { key: "status" as const, header: "Statut" },
      { key: "comment" as const, header: "Commentaire" },
    ];
    const csv = toCsv(rows, cols);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Nom,Prénom,#,Statut,Commentaire");
    expect(lines[1]).toBe("Dupont,Jean,7,present,");
    expect(lines[2]).toBe('Martin,Pierre,11,absent,"Blessure, genou"');
    expect(lines[3]).toBe("Hassan,Ali,3,pending,");
  });
});
