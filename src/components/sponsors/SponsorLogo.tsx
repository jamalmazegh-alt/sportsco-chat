import { useEffect, useState } from "react";

/**
 * SponsorLogo — affiche un logo sponsor en supprimant automatiquement
 * les marges blanches/transparentes, puis en adaptant la taille au ratio
 * du contenu réel (logo bandeau → plus large, logo carré → plus haut).
 */

type Trimmed = { url: string; ratio: number };

const cache = new Map<string, Trimmed>();

function isEmpty(data: Uint8ClampedArray, i: number): boolean {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const a = data[i + 3];
  if (a < 16) return true;
  return r > 242 && g > 242 && b > 242;
}

async function trimLogo(src: string): Promise<Trimmed> {
  const hit = cache.get(src);
  if (hit) return hit;

  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("load failed"));
    img.src = src;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    const fallback = { url: src, ratio: img.naturalWidth / img.naturalHeight };
    cache.set(src, fallback);
    return fallback;
  }

  let top = canvas.height;
  let bottom = 0;
  let left = canvas.width;
  let right = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (!isEmpty(data, (y * canvas.width + x) * 4)) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (right <= left || bottom <= top) {
    const fallback = { url: src, ratio: img.naturalWidth / img.naturalHeight };
    cache.set(src, fallback);
    return fallback;
  }

  const pad = Math.round(Math.max(right - left, bottom - top) * 0.02);
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(canvas.width - 1, right + pad);
  bottom = Math.min(canvas.height - 1, bottom + pad);

  const w = right - left + 1;
  const h = bottom - top + 1;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.drawImage(img, left, top, w, h, 0, 0, w, h);

  let url: string;
  try {
    url = out.toDataURL("image/png");
  } catch {
    url = src;
  }

  const result = { url, ratio: w / h };
  cache.set(src, result);
  return result;
}

interface Props {
  src: string;
  alt?: string;
  /** Hauteur max du slot en px (défaut 72) */
  maxHeight?: number;
  /** Largeur max du slot en px (défaut 240) */
  maxWidth?: number;
  className?: string;
  onError?: () => void;
}

export function SponsorLogo({
  src,
  alt = "",
  maxHeight = 96,
  maxWidth = 320,
  className,
  onError,
}: Props) {
  const [logo, setLogo] = useState<Trimmed | null>(null);

  useEffect(() => {
    let alive = true;
    setLogo(null);
    trimLogo(src)
      .then((t) => {
        if (alive) setLogo(t);
      })
      .catch(() => {
        if (alive) setLogo({ url: src, ratio: 3 });
      });
    return () => {
      alive = false;
    };
  }, [src]);

  if (!logo) {
    return (
      <div
        className={className}
        style={{ height: maxHeight, width: Math.min(maxWidth, maxHeight * 3) }}
        aria-hidden
      />
    );
  }

  const slotRatio = maxWidth / maxHeight;
  const style =
    logo.ratio >= slotRatio
      ? { width: maxWidth, height: maxWidth / logo.ratio }
      : { height: maxHeight, width: maxHeight * logo.ratio };

  return (
    <img
      src={logo.url}
      alt={alt}
      className={className}
      style={{ ...style, objectFit: "contain", display: "block" }}
      loading="lazy"
      onError={onError}
    />
  );
}

export default SponsorLogo;
