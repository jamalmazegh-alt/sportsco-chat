
// ───────────────────────────── Logo helpers ─────────────────────────────

async function fetchImage(
  url: string,
): Promise<{ bytes: ArrayBuffer; kind: "png" | "jpg" } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const bytes = await res.arrayBuffer();
    if (ct.includes("png") || url.toLowerCase().endsWith(".png")) return { bytes, kind: "png" };
    if (
      ct.includes("jpeg") ||
      ct.includes("jpg") ||
      url.toLowerCase().endsWith(".jpg") ||
      url.toLowerCase().endsWith(".jpeg")
    )
      return { bytes, kind: "jpg" };
    // Sniff magic bytes as fallback (PNG: 89 50 4E 47; JPEG: FF D8 FF)
    const head = new Uint8Array(bytes.slice(0, 4));
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47)
      return { bytes, kind: "png" };
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { bytes, kind: "jpg" };
    return null;
  } catch {
    return null;
  }
}

async function embedImage(
  doc: PDFDocument,
  img: { bytes: ArrayBuffer; kind: "png" | "jpg" } | null,
): Promise<PDFImage | null> {
  if (!img) return null;
  try {
    return img.kind === "png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
  } catch {
    return null;
  }
}

function drawLogoImage(ctx: Ctx, cx: number, cy: number, r: number, img: PDFImage) {
  const maxSide = r * 2;
  const ratio = img.width / img.height;
  const w = ratio >= 1 ? maxSide : maxSide * ratio;
  const h = ratio >= 1 ? maxSide / ratio : maxSide;
  ctx.page.drawImage(img, {
    x: cx - w / 2,
    y: cy - h / 2,
    width: w,
    height: h,
  });
}
