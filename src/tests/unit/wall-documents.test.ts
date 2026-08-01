import { describe, it, expect } from "vitest";
import {
  flattenDocuments,
  groupDocumentsByMonth,
  documentKind,
  formatFileSize,
  isExternalPost,
  hasMissingLabel,
  type DocumentPost,
} from "@/lib/wall/documents";

function post(over: Partial<DocumentPost> & { id: string }): DocumentPost {
  return {
    created_at: "2026-08-01T10:00:00.000Z",
    author_user_id: "u1",
    attachments: [],
    hidden_at: null,
    source: "clubero",
    ...over,
  };
}

const PDF = {
  url: "https://cdn/x.pdf",
  path: "u1/wall/1-x.pdf",
  name: "programme_reprise.pdf",
  type: "application/pdf",
  size: 2048,
  label: "Programme de reprise",
};

describe("flattenDocuments", () => {
  it("aplatit chaque pièce jointe en un document et conserve le nom saisi", () => {
    const docs = flattenDocuments([post({ id: "p1", attachments: [PDF] })]);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      key: "p1:u1/wall/1-x.pdf",
      postId: "p1",
      name: "programme_reprise.pdf",
      label: "Programme de reprise",
      hidden: false,
    });
  });

  it("expose label=null pour les pièces jointes publiées avant la docuthèque", () => {
    const legacy = { ...PDF, label: undefined };
    const docs = flattenDocuments([post({ id: "p1", attachments: [legacy] })]);
    expect(docs[0].label).toBeNull();
    expect(docs[0].name).toBe("programme_reprise.pdf");
  });

  it("traite un label vide ou blanc comme absent", () => {
    const docs = flattenDocuments([post({ id: "p1", attachments: [{ ...PDF, label: "   " }] })]);
    expect(docs[0].label).toBeNull();
  });

  it("ignore les posts sans pièce jointe et les tableaux vides", () => {
    expect(flattenDocuments([post({ id: "p1", attachments: [] })])).toHaveLength(0);
    expect(flattenDocuments([post({ id: "p2", attachments: null })])).toHaveLength(0);
  });

  it("ignore silencieusement les entrées jsonb malformées", () => {
    const docs = flattenDocuments([
      post({
        id: "p1",
        attachments: [
          null,
          "pas un objet",
          42,
          [],
          { url: "https://cdn/y.pdf" }, // pas de path ni de name
          { path: "u1/wall/y.pdf", name: "y.pdf" }, // pas d'url
          PDF, // seule entrée valide
        ],
      }),
    ]);
    expect(docs).toHaveLength(1);
    expect(docs[0].name).toBe("programme_reprise.pdf");
  });

  it("tolère un type et une taille absents", () => {
    const docs = flattenDocuments([
      post({ id: "p1", attachments: [{ url: "u", path: "p", name: "n.txt" }] }),
    ]);
    expect(docs[0]).toMatchObject({ type: "", size: 0 });
  });

  it("écarte les posts relayés des réseaux sociaux", () => {
    const docs = flattenDocuments([
      post({ id: "p1", source: "instagram", attachments: [PDF] }),
      post({ id: "p2", source: "clubero", attachments: [PDF] }),
    ]);
    expect(docs.map((d) => d.postId)).toEqual(["p2"]);
  });

  it("marque les documents des posts masqués par la modération", () => {
    const docs = flattenDocuments([
      post({ id: "p1", hidden_at: "2026-08-02T00:00:00.000Z", attachments: [PDF] }),
    ]);
    expect(docs[0].hidden).toBe(true);
  });

  it("trie du plus récent au plus ancien, à l'inverse de la page Événements", () => {
    const docs = flattenDocuments([
      post({ id: "old", created_at: "2026-01-05T09:00:00.000Z", attachments: [PDF] }),
      post({ id: "new", created_at: "2026-08-01T09:00:00.000Z", attachments: [PDF] }),
      post({ id: "mid", created_at: "2026-05-01T09:00:00.000Z", attachments: [PDF] }),
    ]);
    expect(docs.map((d) => d.postId)).toEqual(["new", "mid", "old"]);
  });

  it("conserve l'ordre des pièces jointes au sein d'un même post", () => {
    const second = { ...PDF, path: "u1/wall/2-z.pdf", name: "z.pdf", label: "Calendrier" };
    const docs = flattenDocuments([post({ id: "p1", attachments: [PDF, second] })]);
    expect(docs.map((d) => d.label)).toEqual(["Programme de reprise", "Calendrier"]);
  });
});

describe("retrait de la docuthèque", () => {
  const excluded = {
    ...PDF,
    path: "u1/wall/2-old.pdf",
    name: "old.pdf",
    excludedFromLibrary: true,
  };

  it("masque par défaut les documents retirés", () => {
    const docs = flattenDocuments([post({ id: "p1", attachments: [PDF, excluded] })]);
    expect(docs.map((d) => d.name)).toEqual(["programme_reprise.pdf"]);
  });

  it("les fait remonter avec includeExcluded, pour pouvoir les remettre", () => {
    const docs = flattenDocuments([post({ id: "p1", attachments: [PDF, excluded] })], {
      includeExcluded: true,
    });
    expect(docs.map((d) => d.name)).toEqual(["programme_reprise.pdf", "old.pdf"]);
    expect(docs[1].excludedFromLibrary).toBe(true);
  });

  it("ne considère retiré que la valeur booléenne true", () => {
    // Un jsonb bricolé à la main ne doit pas faire disparaître un document.
    for (const value of ["true", 1, {}, null]) {
      const docs = flattenDocuments([
        post({ id: "p1", attachments: [{ ...PDF, excludedFromLibrary: value }] }),
      ]);
      expect(docs, `valeur ${JSON.stringify(value)}`).toHaveLength(1);
      expect(docs[0].excludedFromLibrary).toBe(false);
    }
  });

  it("expose excludedFromLibrary=false sur les pièces jointes historiques", () => {
    const docs = flattenDocuments([post({ id: "p1", attachments: [PDF] })]);
    expect(docs[0].excludedFromLibrary).toBe(false);
  });
});

describe("groupDocumentsByMonth", () => {
  it("groupe par mois, du plus récent au plus ancien, à travers les années", () => {
    const docs = flattenDocuments([
      post({ id: "a", created_at: "2026-08-20T09:00:00.000Z", attachments: [PDF] }),
      post({ id: "b", created_at: "2026-08-02T09:00:00.000Z", attachments: [PDF] }),
      post({ id: "c", created_at: "2025-12-31T09:00:00.000Z", attachments: [PDF] }),
    ]);
    const groups = groupDocumentsByMonth(docs);
    expect(groups.map((g) => g.key)).toEqual(["2026-08", "2025-12"]);
    expect(groups[0].items.map((d) => d.postId)).toEqual(["a", "b"]);
    expect(groups[1].items).toHaveLength(1);
  });

  it("produit une clé de mois sur deux chiffres", () => {
    const docs = flattenDocuments([
      post({ id: "a", created_at: "2026-01-09T09:00:00.000Z", attachments: [PDF] }),
    ]);
    expect(groupDocumentsByMonth(docs)[0].key).toBe("2026-01");
  });

  it("renvoie une liste vide sans document", () => {
    expect(groupDocumentsByMonth([])).toEqual([]);
  });
});

describe("documentKind", () => {
  it("classe par MIME", () => {
    expect(documentKind("image/png", "a.png")).toBe("image");
    expect(documentKind("application/pdf", "a.pdf")).toBe("pdf");
    expect(
      documentKind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "a.docx",
      ),
    ).toBe("doc");
    expect(
      documentKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "a.xlsx"),
    ).toBe("sheet");
  });

  it("se rabat sur l'extension quand le MIME est absent", () => {
    expect(documentKind("", "photo.HEIC")).toBe("image");
    expect(documentKind("", "note.pdf")).toBe("pdf");
    expect(documentKind("", "liste.csv")).toBe("sheet");
    expect(documentKind("", "inconnu")).toBe("other");
  });
});

describe("isExternalPost", () => {
  it("ne considère externe que les sources réseaux sociaux", () => {
    expect(isExternalPost({ source: "clubero" })).toBe(false);
    expect(isExternalPost({ source: null })).toBe(false);
    expect(isExternalPost({ source: "facebook" })).toBe(true);
  });
});

describe("hasMissingLabel", () => {
  it("bloque tant qu'une pièce jointe n'est pas nommée", () => {
    expect(hasMissingLabel([])).toBe(false);
    expect(hasMissingLabel([{ label: "Calendrier" }])).toBe(false);
    expect(hasMissingLabel([{ label: "Calendrier" }, {}])).toBe(true);
    expect(hasMissingLabel([{ label: "   " }])).toBe(true);
  });
});

describe("formatFileSize", () => {
  it("formate en o / Ko / Mo", () => {
    expect(formatFileSize(0)).toBe("");
    expect(formatFileSize(512)).toBe("512 o");
    expect(formatFileSize(2048)).toBe("2 Ko");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3 Mo");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 Mo");
  });
});
