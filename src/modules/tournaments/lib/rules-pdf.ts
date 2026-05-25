import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { ALL_TIEBREAKERS, type TournamentRules } from "./rules";

interface TournamentInfo {
  name: string;
  sport: string;
  category?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  location?: string | null;
  format?: string | null;
  num_teams?: number | null;
}

const I18N = {
  fr: {
    title: "Règlement officiel",
    sport: "Sport",
    category: "Catégorie",
    dates: "Dates",
    location: "Lieu",
    format: "Format",
    teams: "Équipes",
    organizer: "Organisateur",
    points: "Attribution des points",
    win: "Victoire",
    draw: "Match nul",
    loss: "Défaite",
    tiebreakers: "Critères de départage (dans l'ordre)",
    qualification: "Qualification",
    perGroup: "Équipes qualifiées par groupe",
    bestThirds: "Meilleurs 3es (ou Ne) qualifiés",
    fairPlay: "Fair-play (déductions)",
    yellow: "Carton jaune",
    secondYellow: "2e jaune (expulsion)",
    red: "Carton rouge direct",
    overtime: "Prolongations",
    overtimeOn: "Activées",
    overtimeOff: "Désactivées",
    minutes: "min",
    penalties: "Tirs au but",
    yes: "Oui",
    no: "Non",
    validation: "Validation des matchs",
    requireValidation:
      "Seuls les matchs validés par l'organisateur comptent au classement.",
    noValidation: "Les matchs en statut « terminé » comptent immédiatement.",
    generated: "Document généré le",
    page: "Page",
  },
  en: {
    title: "Official rules",
    sport: "Sport",
    category: "Category",
    dates: "Dates",
    location: "Venue",
    format: "Format",
    teams: "Teams",
    organizer: "Organizer",
    points: "Points awarded",
    win: "Win",
    draw: "Draw",
    loss: "Loss",
    tiebreakers: "Tie-breakers (in order)",
    qualification: "Qualification",
    perGroup: "Teams qualified per group",
    bestThirds: "Best Nth-place qualified",
    fairPlay: "Fair play (deductions)",
    yellow: "Yellow card",
    secondYellow: "Second yellow (sent off)",
    red: "Direct red card",
    overtime: "Extra time",
    overtimeOn: "Enabled",
    overtimeOff: "Disabled",
    minutes: "min",
    penalties: "Penalty shootout",
    yes: "Yes",
    no: "No",
    validation: "Match validation",
    requireValidation:
      "Only matches validated by the organizer count in the standings.",
    noValidation: "Matches marked as completed count immediately.",
    generated: "Document generated on",
    page: "Page",
  },
};

const MARGIN = 50;
const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;

export async function buildRulesPdf(
  tournament: TournamentInfo,
  rules: TournamentRules,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${tournament.name} - ${I18N[rules.language].title}`);
  doc.setCreator("CLUBERO");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const t = I18N[rules.language];

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const accent = parseColor(rules.branding.primaryColor) ?? rgb(0.13, 0.36, 0.85);

  const ctx = { doc, page, y, font, bold, accent };

  // Header bar
  drawHeader(ctx, tournament.name, t.title, rules.branding.organizerName);
  ctx.y -= 30;

  // Meta block
  const metaLines: Array<[string, string]> = [];
  if (tournament.sport) metaLines.push([t.sport, capitalize(tournament.sport)]);
  if (tournament.category) metaLines.push([t.category, tournament.category]);
  if (tournament.starts_on) {
    const dates = tournament.ends_on && tournament.ends_on !== tournament.starts_on
      ? `${formatDate(tournament.starts_on, rules.language)} – ${formatDate(tournament.ends_on, rules.language)}`
      : formatDate(tournament.starts_on, rules.language);
    metaLines.push([t.dates, dates]);
  }
  if (tournament.location) metaLines.push([t.location, tournament.location]);
  if (tournament.format) metaLines.push([t.format, capitalize(tournament.format)]);
  if (tournament.num_teams) metaLines.push([t.teams, String(tournament.num_teams)]);
  if (rules.branding.organizerName)
    metaLines.push([t.organizer, rules.branding.organizerName]);
  drawKeyValues(ctx, metaLines);
  ctx.y -= 10;

  // Points
  section(ctx, t.points);
  drawKeyValues(ctx, [
    [t.win, `${rules.points.win} pts`],
    [t.draw, `${rules.points.draw} pts`],
    [t.loss, `${rules.points.loss} pts`],
  ]);
  ctx.y -= 10;

  // Tie-breakers
  section(ctx, t.tiebreakers);
  const tbLabels = rules.tiebreakers.map((k, i) => {
    const meta = ALL_TIEBREAKERS.find((m) => m.key === k);
    const label = meta
      ? rules.language === "fr"
        ? meta.labelFr
        : meta.labelEn
      : k;
    return `${i + 1}. ${label}`;
  });
  drawList(ctx, tbLabels);
  ctx.y -= 10;

  // Qualification
  section(ctx, t.qualification);
  drawKeyValues(ctx, [
    [t.perGroup, String(rules.qualification.perGroup)],
    [t.bestThirds, String(rules.qualification.bestThirds ?? 0)],
  ]);
  ctx.y -= 10;

  // Fair-play
  section(ctx, t.fairPlay);
  drawKeyValues(ctx, [
    [t.yellow, `${rules.fairPlay.yellow} pts`],
    [t.secondYellow, `${rules.fairPlay.secondYellow} pts`],
    [t.red, `${rules.fairPlay.red} pts`],
  ]);
  ctx.y -= 10;

  // Overtime / penalties
  section(ctx, t.overtime);
  drawKeyValues(ctx, [
    [
      t.overtime,
      rules.overtime.enabled
        ? `${t.overtimeOn} (${rules.overtime.minutes ?? 10} ${t.minutes})`
        : t.overtimeOff,
    ],
    [t.penalties, rules.penaltyShootout.enabled ? t.yes : t.no],
  ]);
  ctx.y -= 10;

  // Validation
  section(ctx, t.validation);
  drawParagraph(
    ctx,
    rules.matchValidation.requireValidation ? t.requireValidation : t.noValidation,
  );
  ctx.y -= 10;

  // Footer
  drawFooter(ctx, `${t.generated} ${formatDate(new Date().toISOString(), rules.language)}`);

  return await doc.save();
}

// ---------- drawing helpers (mutate ctx.y / ctx.page) ----------

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  accent: ReturnType<typeof rgb>;
};

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN) {
    ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
    ctx.y = PAGE_H - MARGIN;
  }
}

function drawHeader(ctx: Ctx, title: string, subtitle: string, organizer?: string) {
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_H - 70,
    width: PAGE_W,
    height: 70,
    color: ctx.accent,
  });
  ctx.page.drawText(safe(title), {
    x: MARGIN,
    y: PAGE_H - 35,
    size: 20,
    font: ctx.bold,
    color: rgb(1, 1, 1),
  });
  ctx.page.drawText(safe(subtitle), {
    x: MARGIN,
    y: PAGE_H - 55,
    size: 11,
    font: ctx.font,
    color: rgb(1, 1, 1),
  });
  if (organizer) {
    const txt = safe(organizer);
    const w = ctx.font.widthOfTextAtSize(txt, 10);
    ctx.page.drawText(txt, {
      x: PAGE_W - MARGIN - w,
      y: PAGE_H - 35,
      size: 10,
      font: ctx.font,
      color: rgb(1, 1, 1),
    });
  }
  ctx.y = PAGE_H - 90;
}

function section(ctx: Ctx, title: string) {
  ensureSpace(ctx, 30);
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - 4,
    width: 3,
    height: 14,
    color: ctx.accent,
  });
  ctx.page.drawText(safe(title), {
    x: MARGIN + 10,
    y: ctx.y,
    size: 13,
    font: ctx.bold,
    color: rgb(0.1, 0.1, 0.1),
  });
  ctx.y -= 22;
}

function drawKeyValues(ctx: Ctx, pairs: Array<[string, string]>) {
  for (const [k, v] of pairs) {
    ensureSpace(ctx, 16);
    ctx.page.drawText(safe(k), {
      x: MARGIN + 6,
      y: ctx.y,
      size: 10,
      font: ctx.font,
      color: rgb(0.35, 0.35, 0.35),
    });
    ctx.page.drawText(safe(v), {
      x: MARGIN + 220,
      y: ctx.y,
      size: 10,
      font: ctx.bold,
      color: rgb(0.1, 0.1, 0.1),
    });
    ctx.y -= 16;
  }
}

function drawList(ctx: Ctx, items: string[]) {
  for (const it of items) {
    ensureSpace(ctx, 16);
    ctx.page.drawText(safe(it), {
      x: MARGIN + 6,
      y: ctx.y,
      size: 10,
      font: ctx.font,
      color: rgb(0.1, 0.1, 0.1),
    });
    ctx.y -= 14;
  }
}

function drawParagraph(ctx: Ctx, text: string) {
  const maxW = PAGE_W - MARGIN * 2 - 6;
  const lines = wrapText(safe(text), ctx.font, 10, maxW);
  for (const line of lines) {
    ensureSpace(ctx, 14);
    ctx.page.drawText(line, {
      x: MARGIN + 6,
      y: ctx.y,
      size: 10,
      font: ctx.font,
      color: rgb(0.1, 0.1, 0.1),
    });
    ctx.y -= 14;
  }
}

function drawFooter(ctx: Ctx, text: string) {
  ctx.page.drawText(safe(text), {
    x: MARGIN,
    y: 30,
    size: 8,
    font: ctx.font,
    color: rgb(0.55, 0.55, 0.55),
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const tryLine = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(tryLine, size) > maxW && cur) {
      out.push(cur);
      cur = w;
    } else {
      cur = tryLine;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Helvetica only supports WinAnsi — strip non-encodable chars.
function safe(s: string): string {
  return s
    .replace(/[\u2212\u2012\u2013\u2014\u2015]/g, "-")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2022\u25E6]/g, "*")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(iso: string, lang: "fr" | "en"): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function parseColor(hex?: string) {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
