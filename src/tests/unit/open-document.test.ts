import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const browserOpen = vi.hoisted(() => vi.fn());
vi.mock("@capacitor/browser", () => ({ Browser: { open: browserOpen } }));

import { openDocument, downloadDocument, handleDocumentClick } from "@/lib/open-document";

type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

function setPlatform(platform: "web" | "android" | "ios" | null) {
  const g = globalThis as { Capacitor?: CapacitorGlobal };
  if (platform === null || platform === "web") {
    delete g.Capacitor;
    return;
  }
  g.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform };
}

const windowOpen = vi.fn();
/** `location` est remplacé par un objet simple : on lit ce qui y est assigné. */
let location: { href: string };

// Chemin blob du téléchargement web : fetch → objectURL → clic sur <a download>.
const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
const fetchMock = vi.fn();

function stubDom() {
  location = { href: "" };
  vi.stubGlobal("window", { open: windowOpen, location });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", { createObjectURL: () => "blob:local", revokeObjectURL: vi.fn() });
  vi.stubGlobal("document", {
    createElement: () => anchor,
    body: { appendChild: vi.fn() },
  });
}

beforeEach(() => {
  browserOpen.mockReset().mockResolvedValue(undefined);
  windowOpen.mockReset();
  anchor.href = "";
  anchor.download = "";
  anchor.click.mockReset();
  anchor.remove.mockReset();
  fetchMock.mockReset().mockResolvedValue({ ok: true, blob: async () => new Blob(["x"]) });
  stubDom();
  setPlatform(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setPlatform(null);
});

describe("openDocument", () => {
  it("ouvre un nouvel onglet sur le web, sans toucher au plugin natif", async () => {
    await openDocument("https://cdn/programme.pdf");
    expect(windowOpen).toHaveBeenCalledWith("https://cdn/programme.pdf", "_blank");
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it("passe par le navigateur natif sur Android — target=_blank y est inerte", async () => {
    setPlatform("android");
    await openDocument("https://cdn/programme.pdf");
    expect(browserOpen).toHaveBeenCalledWith({ url: "https://cdn/programme.pdf" });
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("passe aussi par le navigateur natif sur iOS", async () => {
    setPlatform("ios");
    await openDocument("https://cdn/note.docx");
    expect(browserOpen).toHaveBeenCalledWith({ url: "https://cdn/note.docx" });
  });

  it("retombe sur la WebView si le bridge natif échoue, plutôt qu'un clic mort", async () => {
    setPlatform("android");
    browserOpen.mockRejectedValueOnce(new Error("bridge down"));
    await openDocument("https://cdn/programme.pdf");
    expect(windowOpen).toHaveBeenCalledWith("https://cdn/programme.pdf", "_blank");
  });

  it("ignore une URL vide", async () => {
    await openDocument("");
    expect(windowOpen).not.toHaveBeenCalled();
    expect(browserOpen).not.toHaveBeenCalled();
  });
});

describe("downloadDocument", () => {
  const URL_DL = "https://cdn/programme.pdf?download=programme.pdf";

  it("récupère le fichier et clique un <a download> portant le vrai nom", async () => {
    await downloadDocument(URL_DL, "programme_reprise.pdf");
    expect(fetchMock).toHaveBeenCalledWith(URL_DL);
    expect(anchor.href).toBe("blob:local");
    // Le nom compte : c'est ce que l'attribut `download` cross-origin perdait.
    expect(anchor.download).toBe("programme_reprise.pdf");
    expect(anchor.click).toHaveBeenCalled();
    expect(location.href).toBe("");
  });

  it("n'ouvre JAMAIS de fenêtre sur le web — c'est ce qui était bloqué en popup", async () => {
    await downloadDocument(URL_DL, "a.pdf");
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("retombe sur la navigation directe si le fetch échoue (CORS, hors ligne)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("CORS"));
    await downloadDocument(URL_DL, "a.pdf");
    expect(location.href).toBe(URL_DL);
  });

  it("retombe aussi sur la navigation directe sur une réponse HTTP en erreur", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });
    await downloadDocument(URL_DL, "a.pdf");
    expect(location.href).toBe(URL_DL);
  });

  it("se rabat sur un nom générique quand aucun n'est fourni", async () => {
    await downloadDocument(URL_DL);
    expect(anchor.download).toBe("document");
  });

  it("passe par le navigateur système en natif — une WebView ne télécharge pas", async () => {
    setPlatform("android");
    await downloadDocument(URL_DL, "a.pdf");
    expect(browserOpen).toHaveBeenCalledWith({ url: URL_DL });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retombe sur la navigation si le bridge natif échoue", async () => {
    setPlatform("android");
    browserOpen.mockRejectedValueOnce(new Error("bridge down"));
    await downloadDocument(URL_DL, "a.pdf");
    expect(location.href).toBe(URL_DL);
  });

  it("ignore une URL vide", async () => {
    await downloadDocument("", "a.pdf");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(location.href).toBe("");
  });
});

describe("handleDocumentClick", () => {
  it("laisse le navigateur suivre le lien sur le web", () => {
    const e = { preventDefault: vi.fn() } as unknown as React.MouseEvent;
    handleDocumentClick(e, "https://cdn/x.pdf");
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it("intercepte le clic et délègue au navigateur natif sur mobile", () => {
    setPlatform("android");
    const e = { preventDefault: vi.fn() } as unknown as React.MouseEvent;
    handleDocumentClick(e, "https://cdn/x.pdf");
    expect(e.preventDefault).toHaveBeenCalled();
    expect(browserOpen).toHaveBeenCalledWith({ url: "https://cdn/x.pdf" });
  });
});
