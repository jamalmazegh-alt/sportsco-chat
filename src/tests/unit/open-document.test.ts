import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const browserOpen = vi.hoisted(() => vi.fn());
vi.mock("@capacitor/browser", () => ({ Browser: { open: browserOpen } }));

import { openDocument, handleDocumentClick } from "@/lib/open-document";

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

beforeEach(() => {
  browserOpen.mockReset().mockResolvedValue(undefined);
  windowOpen.mockReset();
  vi.stubGlobal("window", { open: windowOpen });
  setPlatform(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setPlatform(null);
});

describe("openDocument", () => {
  it("ouvre un nouvel onglet sur le web, sans toucher au plugin natif", async () => {
    await openDocument("https://cdn/programme.pdf");
    expect(windowOpen).toHaveBeenCalledWith(
      "https://cdn/programme.pdf",
      "_blank",
      "noopener,noreferrer",
    );
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
    expect(windowOpen).toHaveBeenCalledWith(
      "https://cdn/programme.pdf",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("ignore une URL vide", async () => {
    await openDocument("");
    expect(windowOpen).not.toHaveBeenCalled();
    expect(browserOpen).not.toHaveBeenCalled();
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
