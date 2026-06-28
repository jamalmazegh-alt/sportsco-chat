/**
 * Team Invite Poster (A4 PDF).
 *
 * Premium "Rejoins notre équipe !" poster generated server-side with pdf-lib.
 * - Vectorial layout, selectable text, real QR (vector squares, error-corr M).
 * - DejaVu Sans (Regular + Bold) for Unicode coverage across 7 locales.
 * - Embeds: Clubero logo (public/clubero-logo.png), one anime illustration
 *   (Lovable Asset), optional club logo (rejects SVG for parity with roster
 *   upload hardening).
 * - Authorization is enforced in `.functions.ts` (caller must be admin of the
 *   target club); this module is pure render + safe fetch.
 */
import { PDFDocument, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import { DEJAVU_SANS_REGULAR_B64, DEJAVU_SANS_BOLD_B64 } from "@/lib/match-sheet/fonts.server";

// ─────────────────────────────────────────────────────────────
// i18n
// ─────────────────────────────────────────────────────────────

export type PosterLang = "fr" | "en" | "de" | "es" | "it" | "nl" | "pt";

interface Strings {
  brandTag: string;
  title1: string;
  title2: string;
  subtitle: string;
  bodyP1: string;
  bodyP2: string;
  teamBadge: string;
  scanHint: string;
  benefits: [string, string, string, string, string];
  footerLine: string;
  footerSite: string;
}

const STRINGS: Record<PosterLang, Strings> = {
  fr: {
    brandTag: "TOUS LES CLUBS. TOUTES LES PASSIONS.",
    title1: "REJOINS",
    title2: "TON ÉQUIPE !",
    subtitle: "Scanne ce QR Code pour rejoindre ton équipe sur Clubero.",
    bodyP1: "En quelques secondes, demande à rejoindre ton équipe",
    bodyP2: "et retrouve entraînements, matchs, convocations et infos.",
    teamBadge: "ÉQUIPE",
    scanHint: "Scanne avec ton téléphone",
    benefits: [
      "Organisation simplifiée",
      "Matchs & entraînements",
      "Communication d'équipe",
      "Convocations",
      "Parents connectés",
    ],
    footerLine: "Toute la vie de votre équipe, dans une seule application.",
    footerSite: "clubero.app",
  },
  en: {
    brandTag: "ALL CLUBS. ALL PASSIONS.",
    title1: "JOIN",
    title2: "YOUR TEAM!",
    subtitle: "Scan this QR code to join your team on Clubero.",
    bodyP1: "In seconds, ask to join your team",
    bodyP2: "and stay up to date with training, matches, line-ups and news.",
    teamBadge: "TEAM",
    scanHint: "Scan with your phone",
    benefits: [
      "Simple organisation",
      "Matches & training",
      "Team communication",
      "Line-ups & invites",
      "Connected parents",
    ],
    footerLine: "Your whole team life, in a single app.",
    footerSite: "clubero.app",
  },
  de: {
    brandTag: "ALLE VEREINE. ALLE LEIDENSCHAFTEN.",
    title1: "TRETE",
    title2: "DEINEM TEAM BEI!",
    subtitle: "Scanne diesen QR-Code, um deinem Team auf Clubero beizutreten.",
    bodyP1: "Bitte in Sekunden um den Beitritt zu deinem Team",
    bodyP2: "und bleibe bei Trainings, Spielen, Aufstellungen und News dabei.",
    teamBadge: "TEAM",
    scanHint: "Mit deinem Handy scannen",
    benefits: [
      "Einfache Organisation",
      "Spiele & Trainings",
      "Team-Kommunikation",
      "Aufstellungen",
      "Eltern verbunden",
    ],
    footerLine: "Das ganze Teamleben in einer einzigen App.",
    footerSite: "clubero.app",
  },
  es: {
    brandTag: "TODOS LOS CLUBES. TODAS LAS PASIONES.",
    title1: "¡ÚNETE",
    title2: "¡A TU EQUIPO!",
    subtitle: "Escanea este código QR para unirte a tu equipo en Clubero.",
    bodyP1: "En segundos, solicita unirte a tu equipo",
    bodyP2: "y mantente al día con entrenamientos, partidos, convocatorias e info.",
    teamBadge: "EQUIPO",
    scanHint: "Escanea con tu móvil",
    benefits: [
      "Organización sencilla",
      "Partidos y entrenamientos",
      "Comunicación de equipo",
      "Convocatorias",
      "Padres conectados",
    ],
    footerLine: "Toda la vida de tu equipo, en una sola app.",
    footerSite: "clubero.app",
  },
  it: {
    brandTag: "TUTTI I CLUB. TUTTE LE PASSIONI.",
    title1: "UNISCITI",
    title2: "ALLA NOSTRA SQUADRA!",
    subtitle: "Scansiona questo QR Code per unirti a questa squadra su Clubero.",
    bodyP1: "In pochi secondi, chiedi di unirti alla squadra",
    bodyP2: "e segui allenamenti, partite, convocazioni e novità.",
    teamBadge: "SQUADRA",
    scanHint: "Scansiona con il tuo telefono",
    benefits: [
      "Organizzazione semplice",
      "Partite e allenamenti",
      "Comunicazione di squadra",
      "Convocazioni",
      "Genitori connessi",
    ],
    footerLine: "Tutta la vita della tua squadra, in una sola app.",
    footerSite: "clubero.app",
  },
  nl: {
    brandTag: "ALLE CLUBS. ALLE PASSIES.",
    title1: "WORD",
    title2: "LID VAN ONS TEAM!",
    subtitle: "Scan deze QR-code om dit team te vervoegen op Clubero.",
    bodyP1: "Vraag in enkele seconden om bij het team te komen",
    bodyP2: "en volg trainingen, wedstrijden, oproepen en nieuws.",
    teamBadge: "TEAM",
    scanHint: "Scan met je telefoon",
    benefits: [
      "Eenvoudige organisatie",
      "Wedstrijden & trainingen",
      "Teamcommunicatie",
      "Oproepen",
      "Verbonden ouders",
    ],
    footerLine: "Het hele teamleven in één enkele app.",
    footerSite: "clubero.app",
  },
  pt: {
    brandTag: "TODOS OS CLUBES. TODAS AS PAIXÕES.",
    title1: "JUNTA-TE",
    title2: "À NOSSA EQUIPA!",
    subtitle: "Lê este QR Code para entrar nesta equipa no Clubero.",
    bodyP1: "Em segundos, pede para entrar na equipa",
    bodyP2: "e acompanha treinos, jogos, convocatórias e novidades.",
    teamBadge: "EQUIPA",
    scanHint: "Lê com o teu telemóvel",
    benefits: [
      "Organização simples",
      "Jogos e treinos",
      "Comunicação de equipa",
      "Convocatórias",
      "Pais ligados",
    ],
    footerLine: "Toda a vida da equipa, numa única aplicação.",
    footerSite: "clubero.app",
  },
};

export function pickPosterLang(input?: string | null): PosterLang {
  const v = (input ?? "fr").toLowerCase().slice(0, 2);
  if (v === "en" || v === "de" || v === "es" || v === "it" || v === "nl" || v === "pt") return v;
  return "fr";
}

// ─────────────────────────────────────────────────────────────
// Fonts
// ─────────────────────────────────────────────────────────────

let _reg: Uint8Array | null = null;
let _bold: Uint8Array | null = null;
function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function regularBytes(): Uint8Array {
  if (!_reg) _reg = decode(DEJAVU_SANS_REGULAR_B64);
  return _reg;
}
function boldBytes(): Uint8Array {
  if (!_bold) _bold = decode(DEJAVU_SANS_BOLD_B64);
  return _bold;
}

// ─────────────────────────────────────────────────────────────
// Image fetching (SVG rejected for parity with roster upload hardening)
// ─────────────────────────────────────────────────────────────

type FetchedImage = { kind: "png" | "jpg"; bytes: Uint8Array };

async function fetchImage(url: string): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const buf = new Uint8Array(await res.arrayBuffer());
    if (ct.includes("svg") || ct.includes("xml")) return null;
    if (ct.includes("png")) return { kind: "png", bytes: buf };
    if (ct.includes("jpeg") || ct.includes("jpg")) return { kind: "jpg", bytes: buf };
    // Sniff magic bytes
    if (buf[0] === 0x89 && buf[1] === 0x50) return { kind: "png", bytes: buf };
    if (buf[0] === 0xff && buf[1] === 0xd8) return { kind: "jpg", bytes: buf };
    return null;
  } catch {
    return null;
  }
}

async function embed(doc: PDFDocument, img: FetchedImage | null): Promise<PDFImage | null> {
  if (!img) return null;
  try {
    return img.kind === "png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// QR rendering
// ─────────────────────────────────────────────────────────────

interface QRMatrix {
  size: number;
  /** flat Uint8Array of length size*size; 0/1 */
  data: Uint8Array;
}

function buildQrMatrix(text: string): QRMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const data = qr.modules.data as unknown as Uint8Array;
  return { size, data };
}

// ─────────────────────────────────────────────────────────────
// Text helpers
// ─────────────────────────────────────────────────────────────

function fitText(
  raw: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): { text: string; size: number } {
  let s = size;
  let txt = raw;
  while (font.widthOfTextAtSize(txt, s) > maxWidth && s > 10) s -= 1;
  if (font.widthOfTextAtSize(txt, s) > maxWidth) {
    // truncate with ellipsis
    while (txt.length > 4 && font.widthOfTextAtSize(txt + "…", s) > maxWidth) {
      txt = txt.slice(0, -1);
    }
    txt = txt + "…";
  }
  return { text: txt, size: s };
}

function drawCenteredText(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  cx: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx - w / 2, y, size, font, color });
}

// ─────────────────────────────────────────────────────────────
// Main builder
// ─────────────────────────────────────────────────────────────

export interface BuildTeamPosterInput {
  inviteUrl: string;
  teamName: string;
  clubName?: string | null;
  clubLogoUrl?: string | null;
  lang: PosterLang;
}

const CLUBERO_LOGO_URL = "https://clubero.app/clubero-logo.png";
const ILLUSTRATION_URL =
  "https://clubero.app/__l5e/assets-v1/c0b735eb-9284-488f-b5dd-75667ceaf49d/team-poster-illustration.png";

export async function buildTeamPosterPdf(input: BuildTeamPosterInput): Promise<Uint8Array> {
  const t = STRINGS[input.lang];

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Clubero — ${t.title1} ${t.title2}`);
  doc.setCreator("Clubero");

  const font = await doc.embedFont(regularBytes(), { subset: true });
  const bold = await doc.embedFont(boldBytes(), { subset: true });

  // Brand palette
  const ink = rgb(0.06, 0.09, 0.16); // deep navy
  const muted = rgb(0.46, 0.52, 0.62);
  const teal = rgb(0.169, 0.733, 0.627); // #2BBBA0
  const tealSoft = rgb(0.85, 0.95, 0.92);
  const lavender = rgb(0.91, 0.9, 0.97);
  const surface = rgb(0.973, 0.98, 0.984);
  const white = rgb(1, 1, 1);

  const W = 595.28;
  const H = 841.89;
  const page = doc.addPage([W, H]);

  // ── Background canvas (very light surface)
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: surface });

  // Decorative pastel blobs (geometric, vector — no AI vibe)
  page.drawCircle({ x: -40, y: H - 60, size: 140, color: tealSoft });
  page.drawCircle({ x: W + 40, y: H - 180, size: 130, color: lavender });
  page.drawCircle({ x: -30, y: H / 2 - 50, size: 90, color: lavender });
  page.drawCircle({ x: W + 30, y: 320, size: 110, color: tealSoft });
  // Subtle dot grid (top-right)
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 4; j++) {
      page.drawCircle({
        x: W - 60 - i * 8,
        y: H - 130 - j * 8,
        size: 1.1,
        color: rgb(0.78, 0.85, 0.83),
      });
    }
  }

  // ── Header (logos + center dot)
  const headerY = H - 60;
  const clubero = await embed(doc, await fetchImage(CLUBERO_LOGO_URL));
  if (clubero) {
    const max = 32;
    const r = Math.min(max / clubero.width, max / clubero.height);
    const w = clubero.width * r;
    const h = clubero.height * r;
    page.drawImage(clubero, { x: 40, y: headerY - h / 2, width: w, height: h });
    page.drawText("clubero", {
      x: 40 + w + 8,
      y: headerY - 8,
      size: 16,
      font: bold,
      color: ink,
    });
  }

  // Club logo (right) — optional, safe
  const clubLogo = input.clubLogoUrl ? await embed(doc, await fetchImage(input.clubLogoUrl)) : null;
  if (clubLogo) {
    const max = 38;
    const r = Math.min(max / clubLogo.width, max / clubLogo.height);
    const w = clubLogo.width * r;
    const h = clubLogo.height * r;
    page.drawImage(clubLogo, { x: W - 40 - w, y: headerY - h / 2, width: w, height: h });
  } else if (input.clubName) {
    const name = input.clubName.toUpperCase();
    const f = fitText(name, bold, 11, 150);
    page.drawText(f.text, {
      x: W - 40 - bold.widthOfTextAtSize(f.text, f.size),
      y: headerY - 4,
      size: f.size,
      font: bold,
      color: ink,
    });
  }

  // center "dot" separator
  page.drawCircle({ x: W / 2, y: headerY, size: 3, color: teal });

  // Brand tagline tiny (under right logo)
  drawCenteredText(page, t.brandTag, W - 110, headerY - 26, 6.5, bold, teal);

  // ── Big title
  drawCenteredText(page, t.title1, W / 2, H - 130, 46, bold, ink);
  drawCenteredText(page, t.title2, W / 2, H - 175, 36, bold, teal);

  // ── Subtitle
  drawCenteredText(page, t.subtitle, W / 2, H - 215, 12, font, muted);
  drawCenteredText(page, t.bodyP1, W / 2, H - 232, 10, font, muted);
  drawCenteredText(page, t.bodyP2, W / 2, H - 246, 10, font, muted);

  // ── QR Card
  const cardW = 320;
  const cardH = 360;
  const cardX = (W - cardW) / 2;
  const cardY = 270;

  // Drop shadow (soft, multiple offset)
  for (let i = 6; i >= 1; i--) {
    page.drawRectangle({
      x: cardX - i * 0.4,
      y: cardY - i * 0.6,
      width: cardW + i * 0.8,
      height: cardH + i * 0.6,
      color: rgb(0, 0, 0),
      opacity: 0.025,
    });
  }
  // Card
  page.drawRectangle({
    x: cardX,
    y: cardY,
    width: cardW,
    height: cardH,
    color: white,
    borderColor: rgb(0.92, 0.94, 0.96),
    borderWidth: 1,
  });

  // Team badge label
  const badgeText = t.teamBadge;
  const badgeY = cardY + cardH - 30;
  drawCenteredText(page, badgeText, W / 2, badgeY, 11, bold, teal);

  // Team name (big)
  const teamNameClean = (input.teamName || "").trim().toUpperCase();
  const tn = fitText(teamNameClean, bold, 22, cardW - 30);
  drawCenteredText(page, tn.text, W / 2, badgeY - 26, tn.size, bold, ink);

  // small accent underline
  page.drawRectangle({
    x: W / 2 - 22,
    y: badgeY - 34,
    width: 44,
    height: 2,
    color: teal,
  });

  // ── QR matrix
  const qr = buildQrMatrix(input.inviteUrl);
  const qrAreaSize = 230;
  const moduleSize = qrAreaSize / qr.size;
  const qrX = (W - qrAreaSize) / 2;
  const qrY = cardY + 60;

  // Corner markers (decorative L-shapes, teal)
  const corner = 18;
  const cornerT = 3;
  // top-left
  page.drawRectangle({ x: qrX - 10, y: qrY + qrAreaSize + 6, width: corner, height: cornerT, color: teal });
  page.drawRectangle({ x: qrX - 10, y: qrY + qrAreaSize - corner + 9, width: cornerT, height: corner, color: teal });
  // top-right
  page.drawRectangle({ x: qrX + qrAreaSize + 10 - corner, y: qrY + qrAreaSize + 6, width: corner, height: cornerT, color: teal });
  page.drawRectangle({ x: qrX + qrAreaSize + 10 - cornerT, y: qrY + qrAreaSize - corner + 9, width: cornerT, height: corner, color: teal });
  // bottom-left
  page.drawRectangle({ x: qrX - 10, y: qrY - 9, width: corner, height: cornerT, color: teal });
  page.drawRectangle({ x: qrX - 10, y: qrY - 9, width: cornerT, height: corner, color: teal });
  // bottom-right
  page.drawRectangle({ x: qrX + qrAreaSize + 10 - corner, y: qrY - 9, width: corner, height: cornerT, color: teal });
  page.drawRectangle({ x: qrX + qrAreaSize + 10 - cornerT, y: qrY - 9, width: cornerT, height: corner, color: teal });

  // Draw the QR modules (vector black squares)
  const dark = rgb(0, 0, 0);
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (qr.data[row * qr.size + col]) {
        page.drawRectangle({
          x: qrX + col * moduleSize,
          y: qrY + (qr.size - 1 - row) * moduleSize,
          width: moduleSize + 0.2,
          height: moduleSize + 0.2,
          color: dark,
        });
      }
    }
  }

  // scan hint
  drawCenteredText(page, t.scanHint, W / 2, cardY + 22, 10, bold, teal);

  // ── Illustration (bottom decorative)
  const illu = await embed(doc, await fetchImage(ILLUSTRATION_URL));
  if (illu) {
    const targetW = W - 80;
    const ratio = targetW / illu.width;
    const h = illu.height * ratio;
    const maxH = 150;
    const finalH = Math.min(h, maxH);
    const finalW = (illu.width * finalH) / illu.height;
    page.drawImage(illu, {
      x: (W - finalW) / 2,
      y: 120,
      width: finalW,
      height: finalH,
      opacity: 1,
    });
  }

  // ── Benefits strip (pill row)
  const benY = 92;
  const pillH = 22;
  const pillGap = 6;
  const labels = t.benefits;
  const sizes = labels.map((l) => font.widthOfTextAtSize(l, 7.5) + 18);
  const totalW = sizes.reduce((a, b) => a + b, 0) + pillGap * (labels.length - 1);
  let px = (W - totalW) / 2;
  const dotColors = [teal, rgb(0.73, 0.62, 0.95), rgb(0.98, 0.74, 0.31), rgb(0.4, 0.65, 1), teal];
  labels.forEach((label, i) => {
    const w = sizes[i];
    page.drawRectangle({
      x: px,
      y: benY,
      width: w,
      height: pillH,
      color: white,
      borderColor: rgb(0.92, 0.94, 0.96),
      borderWidth: 0.8,
    });
    page.drawCircle({ x: px + 9, y: benY + pillH / 2, size: 3, color: dotColors[i % dotColors.length] });
    page.drawText(label, {
      x: px + 16,
      y: benY + 7,
      size: 7.5,
      font: bold,
      color: ink,
    });
    px += w + pillGap;
  });

  // ── Footer band (teal)
  const fH = 56;
  page.drawRectangle({ x: 0, y: 0, width: W, height: fH, color: teal });
  drawCenteredText(page, t.footerLine, W / 2, fH - 22, 10.5, bold, white);
  drawCenteredText(page, t.footerSite, W / 2, fH - 40, 9, font, white);

  return await doc.save();
}

export function posterFilename(teamName: string): string {
  const safe = (teamName || "team")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40);
  return `clubero-poster-${safe || "team"}.pdf`;
}
