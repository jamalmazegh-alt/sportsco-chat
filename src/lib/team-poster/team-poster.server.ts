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
    title2: "ALLA TUA SQUADRA!",
    subtitle: "Scansiona questo QR Code per unirti alla tua squadra su Clubero.",
    bodyP1: "In pochi secondi, chiedi di unirti alla tua squadra",
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
    title2: "LID VAN JOUW TEAM!",
    subtitle: "Scan deze QR-code om je team te vervoegen op Clubero.",
    bodyP1: "Vraag in enkele seconden om bij je team te komen",
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
    title2: "À TUA EQUIPA!",
    subtitle: "Lê este QR Code para entrar na tua equipa no Clubero.",
    bodyP1: "Em segundos, pede para entrar na tua equipa",
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


export async function buildTeamPosterPdf(input: BuildTeamPosterInput): Promise<Uint8Array> {
  const t = STRINGS[input.lang];

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Clubero — ${t.title1} ${t.title2}`);
  doc.setCreator("Clubero");

  const font = await doc.embedFont(regularBytes(), { subset: true });
  const bold = await doc.embedFont(boldBytes(), { subset: true });

  // Brand palette — aligned with clubero.app marketing site
  const bg = rgb(0.043, 0.067, 0.094);        // deep navy #0B1118
  const bgSoft = rgb(0.075, 0.106, 0.145);    // panel navy #131B25
  const ink = rgb(0.06, 0.09, 0.16);          // for QR on white
  const white = rgb(1, 1, 1);
  const textMuted = rgb(0.62, 0.68, 0.76);    // slate on dark
  const emerald = rgb(0.157, 0.827, 0.443);   // #28D371 CTA green
  const emeraldDeep = rgb(0.09, 0.6, 0.35);
  const hairline = rgb(0.15, 0.2, 0.27);

  const W = 595.28;
  const H = 841.89;
  const page = doc.addPage([W, H]);

  // ── Dark background canvas
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: bg });

  // Subtle emerald glow accents (layered translucent circles)
  const glow = (cx: number, cy: number, r: number, alpha: number) => {
    for (let i = 4; i >= 1; i--) {
      page.drawCircle({
        x: cx,
        y: cy,
        size: r * (i / 4),
        color: emerald,
        opacity: (alpha * (5 - i)) / 12,
      });
    }
  };
  glow(-30, H - 40, 180, 0.35);
  glow(W + 20, 260, 200, 0.28);

  // Faint dot grid (top-right)
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 4; j++) {
      page.drawCircle({
        x: W - 60 - i * 8,
        y: H - 130 - j * 8,
        size: 1.1,
        color: rgb(0.25, 0.32, 0.4),
      });
    }
  }

  // ── Header
  const headerCenterY = H - 60;
  const clubero = await embed(doc, await fetchImage(CLUBERO_LOGO_URL));
  if (clubero) {
    const max = 110;
    const r = Math.min(max / clubero.width, max / clubero.height);
    const w = clubero.width * r;
    const h = clubero.height * r;
    page.drawImage(clubero, { x: 40, y: headerCenterY - h / 2, width: w, height: h });
  }

  // Club logo (right)
  const clubLogo = input.clubLogoUrl ? await embed(doc, await fetchImage(input.clubLogoUrl)) : null;
  if (clubLogo) {
    const max = 95;
    const r = Math.min(max / clubLogo.width, max / clubLogo.height);
    const w = clubLogo.width * r;
    const h = clubLogo.height * r;
    page.drawImage(clubLogo, { x: W - 40 - w, y: headerCenterY - h / 2, width: w, height: h });
  } else if (input.clubName) {
    const name = input.clubName.toUpperCase();
    const f = fitText(name, bold, 16, 200);
    page.drawText(f.text, {
      x: W - 40 - bold.widthOfTextAtSize(f.text, f.size),
      y: headerCenterY - 6,
      size: f.size,
      font: bold,
      color: white,
    });
  }

  // Brand tagline tiny
  drawCenteredText(page, t.brandTag, W - 110, headerCenterY - 60, 6.5, bold, emerald);

  // ── Big title — white with emerald highlight
  drawCenteredText(page, t.title1, W / 2, H - 160, 44, bold, white);
  drawCenteredText(page, t.title2, W / 2, H - 202, 34, bold, emerald);

  // ── Subtitle + body (clear line break, well centred above QR card)
  drawCenteredText(page, t.subtitle, W / 2, H - 250, 12, font, textMuted);
  drawCenteredText(page, t.bodyP1, W / 2, H - 276, 10, font, textMuted);
  drawCenteredText(page, t.bodyP2, W / 2, H - 296, 10, font, textMuted);

  // ── QR Card (light card floating on dark bg)
  const cardW = 320;
  const cardH = 340;
  const cardX = (W - cardW) / 2;
  const cardY = 230;

  // Emerald glow behind card
  glow(W / 2, cardY + cardH / 2, 260, 0.4);

  // Card background (white)
  page.drawRectangle({
    x: cardX,
    y: cardY,
    width: cardW,
    height: cardH,
    color: white,
  });
  // Emerald top accent bar
  page.drawRectangle({
    x: cardX,
    y: cardY + cardH - 5,
    width: cardW,
    height: 5,
    color: emerald,
  });

  // Badge "TEAM / ÉQUIPE" — pill style like marketing CTA
  const badgeText = t.teamBadge;
  const badgeFontSize = 9;
  const badgePadX = 14;
  const badgeW = bold.widthOfTextAtSize(badgeText, badgeFontSize) + badgePadX * 2;
  const badgeH = 22;
  const badgeX = cardX + (cardW - badgeW) / 2;
  const badgeY = cardY + cardH - badgeH - 24;
  page.drawRectangle({ x: badgeX, y: badgeY, width: badgeW, height: badgeH, color: emerald });
  page.drawCircle({ x: badgeX, y: badgeY + badgeH / 2, size: badgeH / 2, color: emerald });
  page.drawCircle({ x: badgeX + badgeW, y: badgeY + badgeH / 2, size: badgeH / 2, color: emerald });
  page.drawText(badgeText, {
    x: badgeX + badgePadX,
    y: badgeY + 7,
    size: badgeFontSize,
    font: bold,
    color: white,
  });

  // Team name
  const nameMaxW = cardW - 32;
  const teamFitted = fitText(input.teamName, bold, 22, nameMaxW);
  drawCenteredText(
    page,
    teamFitted.text,
    cardX + cardW / 2,
    badgeY - 28,
    teamFitted.size,
    bold,
    ink,
  );

  // QR matrix
  const qr = buildQrMatrix(input.inviteUrl);
  const qrAreaSize = 200;
  const cell = qrAreaSize / qr.size;
  const qrX = cardX + (cardW - qrAreaSize) / 2;
  const qrY = cardY + 50;
  page.drawRectangle({
    x: qrX - 8,
    y: qrY - 8,
    width: qrAreaSize + 16,
    height: qrAreaSize + 16,
    color: white,
  });
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.data[y * qr.size + x]) {
        page.drawRectangle({
          x: qrX + x * cell,
          y: qrY + (qr.size - 1 - y) * cell,
          width: cell + 0.4,
          height: cell + 0.4,
          color: ink,
        });
      }
    }
  }

  // Scan hint (on white card)
  drawCenteredText(
    page,
    t.scanHint,
    cardX + cardW / 2,
    cardY + 20,
    9.5,
    font,
    rgb(0.4, 0.46, 0.55),
  );

  // ── Benefits pills on dark bg — ghost pills with emerald dot
  const benY = 100;
  const pillH = 24;
  const pillGap = 6;
  const labels = t.benefits;
  const sizes = labels.map((l) => font.widthOfTextAtSize(l, 7.5) + 20);
  const totalW = sizes.reduce((a, b) => a + b, 0) + pillGap * (labels.length - 1);
  let px = (W - totalW) / 2;
  labels.forEach((label, i) => {
    const w = sizes[i];
    page.drawRectangle({
      x: px,
      y: benY,
      width: w,
      height: pillH,
      color: bgSoft,
      borderColor: hairline,
      borderWidth: 0.8,
    });
    page.drawCircle({
      x: px + 10,
      y: benY + pillH / 2,
      size: 3,
      color: emerald,
    });
    page.drawText(label, {
      x: px + 17,
      y: benY + 8,
      size: 7.5,
      font: bold,
      color: white,
    });
    px += w + pillGap;
  });

  // ── Footer band (emerald)
  const fH = 60;
  page.drawRectangle({ x: 0, y: 0, width: W, height: fH, color: emerald });
  page.drawRectangle({ x: 0, y: fH, width: W, height: 2, color: emeraldDeep });
  drawCenteredText(page, t.footerLine, W / 2, fH - 24, 11, bold, white);
  drawCenteredText(page, t.footerSite, W / 2, fH - 42, 9, font, rgb(0.92, 1, 0.96));

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
