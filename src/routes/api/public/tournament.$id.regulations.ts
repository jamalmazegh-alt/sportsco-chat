import { createFileRoute } from "@tanstack/react-router";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mergeRules } from "@/modules/tournaments/lib/rules";

// ── Constantes mise en page (A4 portrait, marges en pt — 1mm ≈ 2.83465pt) ──
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_L = 62; // ~22mm
const MARGIN_R = 51; // ~18mm
const MARGIN_T = 56; // ~20mm
const MARGIN_B = 51; // ~18mm
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

const BLACK = rgb(0.102, 0.102, 0.102); // #1A1A1A
const GREY = rgb(0.533, 0.533, 0.533); // #888
const LIGHT_GREY = rgb(0.8, 0.8, 0.8); // #CCC
const SOFT_BG = rgb(0.961, 0.961, 0.961); // #F5F5F5

type Lang = "fr" | "en";

export const Route = createFileRoute("/api/public/tournament/$id/regulations")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const langParam = (url.searchParams.get("lang") ?? "fr").toLowerCase();
        if (langParam !== "fr" && langParam !== "en") {
          return new Response("Invalid lang parameter", { status: 400 });
        }
        const lang: Lang = langParam;

        const { data: t, error } = await supabaseAdmin
          .from("tournaments")
          .select("*")
          .eq("id", params.id)
          .maybeSingle();

        if (error) return new Response(error.message, { status: 500 });
        if (!t) return new Response("Tournament not found", { status: 404 });

        const rules = mergeRules(t.settings);

        // Mode "uploaded" — stream the organizer-provided PDF instead of generating one.
        if (rules.regulations.mode === "uploaded" && rules.regulations.uploadedUrl) {
          const upstream = await fetch(rules.regulations.uploadedUrl);
          if (!upstream.ok) {
            return new Response("Uploaded regulations not available", { status: 502 });
          }
          return new Response(upstream.body, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `inline; filename="reglement-${t.slug}.pdf"`,
              "Cache-Control": "public, max-age=300",
            },
          });
        }

        // Try to embed the Clubero logo (best effort).
        let logoBytes: ArrayBuffer | null = null;
        try {
          const logoRes = await fetch(new URL("/clubero-logo.png", request.url));
          if (logoRes.ok) logoBytes = await logoRes.arrayBuffer();
        } catch {
          logoBytes = null;
        }

        const pdf = await buildRegulationsPdf(t, rules, lang, logoBytes);

        return new Response(pdf as unknown as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="reglement-${t.slug}.pdf"`,
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});

// ───────────────────────────── i18n ─────────────────────────────

const I18N = {
  fr: {
    subtitle: "Règlement officiel",
    logoClub: "LOGO / CLUB",
    logoTournament: "LOGO / TOURNOI",
    formatTeams: (f: string, n: number) => `Format ${f} · ${n} équipes`,
    metaTbd: "À définir",
    article: "Article",
    titles: [
      "PARTICIPANTS",
      "SYSTÈME DE JEU",
      "CLASSEMENT ET DÉPARTAGE",
      "QUALIFICATION",
      "FAIR-PLAY ET SANCTIONS",
      "FORMAT DES MATCHS",
      "RESPONSABILITÉS",
    ],
    a1: (n: number, cat: string, fmt: string, date: string, loc: string) =>
      `Le tournoi rassemble ${n} équipes de la catégorie ${cat}, au format ${fmt}, le ${date} à ${loc}. ` +
      `Les inscriptions sont validées par l'organisateur après vérification de l'éligibilité et du paiement éventuel des droits d'engagement.`,
    a2Intro:
      "La phase de groupes se joue selon un format toutes rondes. À l'issue de chaque rencontre, les points sont attribués comme suit :",
    a2Win: "Victoire",
    a2Draw: "Match nul",
    a2Loss: "Défaite",
    a2Points: (n: number) => `${n} point${Math.abs(n) > 1 ? "s" : ""}`,
    a2Outro:
      "Les résultats sont enregistrés par l'organisateur sur la plateforme et validés à l'issue de chaque rencontre.",
    a3Intro:
      "En cas d'égalité de points entre deux ou plusieurs équipes, le classement est établi selon les critères suivants, appliqués dans l'ordre :",
    a4PerGroup: (n: number) =>
      `À l'issue de la phase de groupes, les ${n} premières équipes de chaque groupe sont qualifiées pour la phase finale.`,
    a4WithThirds: (n: number) =>
      `Les ${n} meilleurs troisièmes (toutes poules confondues) sont également qualifiés, selon les critères de départage de l'article 3.`,
    a4NoThirds:
      "Aucune place supplémentaire n'est accordée aux meilleurs troisièmes.",
    a5Intro:
      "Le fair-play est intégré au classement. Les sanctions disciplinaires entraînent les déductions suivantes :",
    a5Yellow: "Carton jaune",
    a5Second: "Second jaune (expulsion)",
    a5Red: "Carton rouge direct",
    a5Pts: (n: number) => `−${n} point${n > 1 ? "s" : ""}`,
    a5Outro:
      "Toute expulsion entraîne une suspension automatique pour la rencontre suivante. L'organisateur peut aggraver la sanction en cas de comportement antisportif avéré.",
    a6Both:
      "En cas d'égalité à l'issue du temps réglementaire d'un match à élimination directe, une prolongation est jouée. Si l'égalité persiste, l'issue de la rencontre est décidée par une séance de tirs au but.",
    a6PenaltiesOnly:
      "En cas d'égalité à l'issue du temps réglementaire d'un match à élimination directe, l'issue de la rencontre est directement décidée par une séance de tirs au but (sans prolongation).",
    a6None:
      "En cas d'égalité à l'issue du temps réglementaire d'un match à élimination directe, l'équipe la mieux classée à l'issue de la phase de groupes est qualifiée d'office.",
    a6Outro:
      "Les résultats sont validés par l'organisateur immédiatement après la rencontre.",
    a7:
      "Chaque club participant reste responsable de ses joueurs, encadrants et accompagnants, tant sur le plan sportif que disciplinaire. " +
      "La participation au tournoi vaut acceptation pleine et entière du présent règlement. L'organisateur se réserve le droit de modifier, à tout moment et pour des raisons indépendantes de sa volonté, les modalités d'organisation, dans le respect de l'équité sportive.",
    italic:
      "Ce document est généré automatiquement par la plateforme Clubero à partir des paramètres officiels du tournoi.",
    footerLeft: (date: string) => `Document généré le ${date} · clubero.app`,
    footerRight: "Powered by Clubero",
    page: "Page",
    of: "sur",
    monthsLong: [
      "janvier","février","mars","avril","mai","juin",
      "juillet","août","septembre","octobre","novembre","décembre",
    ],
    monthsShort: [
      "janv.","févr.","mars","avr.","mai","juin",
      "juil.","août","sept.","oct.","nov.","déc.",
    ],
  },
  en: {
    subtitle: "Official Regulations",
    logoClub: "CLUB / LOGO",
    logoTournament: "TOURNAMENT / LOGO",
    formatTeams: (f: string, n: number) => `${f} format · ${n} teams`,
    metaTbd: "TBD",
    article: "Article",
    titles: [
      "PARTICIPANTS",
      "MATCH SYSTEM",
      "RANKINGS AND TIEBREAKERS",
      "QUALIFICATION",
      "FAIR PLAY AND DISCIPLINE",
      "MATCH FORMAT",
      "LIABILITY",
    ],
    a1: (n: number, cat: string, fmt: string, date: string, loc: string) =>
      `The tournament brings together ${n} teams in the ${cat} category, ${fmt} format, on ${date} at ${loc}. ` +
      `Registrations are validated by the organizer after verification of eligibility and payment of entry fees, if applicable.`,
    a2Intro:
      "The group stage is played as a round-robin. After each match, points are awarded as follows:",
    a2Win: "Win",
    a2Draw: "Draw",
    a2Loss: "Loss",
    a2Points: (n: number) => `${n} point${Math.abs(n) > 1 ? "s" : ""}`,
    a2Outro:
      "Results are entered by the organizer on the platform and validated at the end of each match.",
    a3Intro:
      "If two or more teams are tied on points, ranking is determined by the following criteria, applied in order:",
    a4PerGroup: (n: number) =>
      `At the end of the group stage, the top ${n} teams of each group qualify for the knockout stage.`,
    a4WithThirds: (n: number) =>
      `The ${n} best third-placed teams (across all groups) also qualify, according to the tiebreakers listed in Article 3.`,
    a4NoThirds: "No additional spots are granted to the best third-placed teams.",
    a5Intro:
      "Fair play is included in the standings. Disciplinary sanctions trigger the following deductions:",
    a5Yellow: "Yellow card",
    a5Second: "Second yellow (sent off)",
    a5Red: "Direct red card",
    a5Pts: (n: number) => `−${n} point${n > 1 ? "s" : ""}`,
    a5Outro:
      "Any sending-off results in an automatic suspension for the following match. The organizer may increase the sanction in case of proven unsporting behavior.",
    a6Both:
      "If a knockout match is tied at the end of regulation time, extra time is played. If teams remain tied, the match is decided by a penalty shootout.",
    a6PenaltiesOnly:
      "If a knockout match is tied at the end of regulation time, the match is decided directly by a penalty shootout (no extra time).",
    a6None:
      "If a knockout match is tied at the end of regulation time, the team ranked higher at the end of the group stage qualifies automatically.",
    a6Outro:
      "Results are validated by the organizer immediately after each match.",
    a7:
      "Each participating club remains responsible for its players, staff and accompanying persons, both on a sporting and disciplinary level. " +
      "Participation in the tournament implies full acceptance of these regulations. The organizer reserves the right to modify the organization at any time, for reasons beyond its control, while respecting sporting fairness.",
    italic:
      "This document is automatically generated by the Clubero platform from the tournament's official settings.",
    footerLeft: (date: string) => `Generated on ${date} · clubero.app`,
    footerRight: "Powered by Clubero",
    page: "Page",
    of: "of",
    monthsLong: [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December",
    ],
    monthsShort: [
      "Jan","Feb","Mar","Apr","May","Jun",
      "Jul","Aug","Sep","Oct","Nov","Dec",
    ],
  },
} as const;

const TIEBREAKER_LABELS: Record<string, { fr: string; en: string }> = {
  points: { fr: "Points", en: "Points" },
  head_to_head: {
    fr: "Confrontations directes",
    en: "Head-to-head result",
  },
  head_to_head_points: {
    fr: "Confrontations directes — points",
    en: "Head-to-head points",
  },
  head_to_head_gd: {
    fr: "Confrontations directes — différence de buts",
    en: "Head-to-head goal difference",
  },
  head_to_head_gf: {
    fr: "Confrontations directes — buts marqués",
    en: "Head-to-head goals scored",
  },
  goal_diff: { fr: "Différence de buts générale", en: "Overall goal difference" },
  goals_for: { fr: "Buts marqués", en: "Goals scored" },
  wins: { fr: "Nombre de victoires", en: "Number of wins" },
  fair_play: { fr: "Fair-play (cartons)", en: "Fair play (cards)" },
  draw_lot: { fr: "Tirage au sort", en: "Random draw" },
};

// ───────────────────────────── Builder ─────────────────────────────

type Tournament = {
  id: string;
  name: string;
  slug: string;
  sport: string | null;
  category: string | null;
  starts_on: string;
  ends_on: string | null;
  location: string | null;
  format: string;
  num_teams: number;
  points_win: number;
  points_draw: number;
  points_loss: number;
  tiebreakers: unknown;
  settings: unknown;
};

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  lang: Lang;
  pageNo: number;
};

async function buildRegulationsPdf(
  t: Tournament,
  rules: ReturnType<typeof mergeRules>,
  lang: Lang,
  logoBytes: ArrayBuffer | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${t.name} — ${I18N[lang].subtitle}`);
  doc.setCreator("Clubero");
  doc.setProducer("Clubero");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: Ctx = { doc, page, y: PAGE_H - MARGIN_T, font, bold, italic, lang, pageNo: 1 };

  drawCoverBlock(ctx, t, lang);
  ctx.y -= 18;

  // ── Articles ──
  const tb = Array.isArray(t.tiebreakers) ? (t.tiebreakers as string[]) : [];

  const dateStr = formatLongDate(t.starts_on, lang);
  const loc = t.location?.trim() || I18N[lang].metaTbd;
  const cat = t.category?.trim() || (lang === "fr" ? "toutes catégories" : "all categories");
  const fmt = t.format || "group";

  drawArticle(ctx, 1, [I18N[lang].a1(t.num_teams, cat, fmt, dateStr, loc)]);

  // Article 2
  drawArticle(ctx, 2, [I18N[lang].a2Intro]);
  drawBullets(ctx, [
    `${I18N[lang].a2Win} : ${I18N[lang].a2Points(t.points_win)}`,
    `${I18N[lang].a2Draw} : ${I18N[lang].a2Points(t.points_draw)}`,
    `${I18N[lang].a2Loss} : ${I18N[lang].a2Points(t.points_loss)}`,
  ]);
  drawParagraph(ctx, I18N[lang].a2Outro);

  // Article 3 — tiebreakers
  drawArticle(ctx, 3, [I18N[lang].a3Intro]);
  const tbLines = tb.map((k, i) => {
    const meta = TIEBREAKER_LABELS[k];
    const label = meta ? meta[lang] : k;
    return `${i + 1}. ${label}`;
  });
  drawBullets(ctx, tbLines, { numbered: true });

  // Article 4
  const perGroup = rules.qualification.perGroup ?? 2;
  const bestThirds = rules.qualification.bestThirds ?? 0;
  const a4Lines = [I18N[lang].a4PerGroup(perGroup)];
  a4Lines.push(bestThirds > 0 ? I18N[lang].a4WithThirds(bestThirds) : I18N[lang].a4NoThirds);
  drawArticle(ctx, 4, a4Lines);

  // Article 5 — fair-play
  const fp = rules.fairPlay;
  drawArticle(ctx, 5, [I18N[lang].a5Intro]);
  drawBullets(ctx, [
    `${I18N[lang].a5Yellow} : ${I18N[lang].a5Pts(Math.abs(fp.yellow ?? 0))}`,
    `${I18N[lang].a5Second} : ${I18N[lang].a5Pts(Math.abs(fp.secondYellow ?? 0))}`,
    `${I18N[lang].a5Red} : ${I18N[lang].a5Pts(Math.abs(fp.red ?? 0))}`,
  ]);
  drawParagraph(ctx, I18N[lang].a5Outro);

  // Article 6
  const ot = rules.overtime.enabled;
  const pso = rules.penaltyShootout.enabled;
  const a6Main = ot && pso ? I18N[lang].a6Both : !ot && pso ? I18N[lang].a6PenaltiesOnly : I18N[lang].a6None;
  drawArticle(ctx, 6, [a6Main, I18N[lang].a6Outro]);

  // Article 7
  drawArticle(ctx, 7, [I18N[lang].a7]);

  // Note italique avant footer
  drawItalicNote(ctx, I18N[lang].italic);

  // Footer sur toutes les pages (avec logo Clubero si dispo)
  let logoImage = null;
  if (logoBytes) {
    try {
      logoImage = await doc.embedPng(logoBytes);
    } catch {
      logoImage = null;
    }
  }
  drawFooterOnAllPages(doc, font, bold, lang, logoImage);

  return await doc.save();
}

// ───────────────────────────── Sections ─────────────────────────────

function drawCoverBlock(ctx: Ctx, t: Tournament, lang: Lang) {
  const top = PAGE_H - 18;
  // Trait épais
  ctx.page.drawRectangle({ x: MARGIN_L, y: top - 2, width: CONTENT_W, height: 2.2, color: BLACK });

  // Cercles logos
  const circleY = top - 38;
  const r = 22;
  drawLogoCircle(ctx, MARGIN_L + r + 4, circleY, r, I18N[lang].logoClub);
  drawLogoCircle(ctx, MARGIN_L + CONTENT_W - r - 4, circleY, r, I18N[lang].logoTournament);

  // Nom du tournoi
  const titleSize = 24;
  const title = safe(t.name.toUpperCase());
  const titleW = ctx.bold.widthOfTextAtSize(title, titleSize);
  ctx.page.drawText(title, {
    x: MARGIN_L + (CONTENT_W - titleW) / 2,
    y: top - 78,
    size: titleSize,
    font: ctx.bold,
    color: BLACK,
  });

  // Sous-titre
  const sub = safe(I18N[lang].subtitle);
  const subW = ctx.font.widthOfTextAtSize(sub, 10);
  ctx.page.drawText(sub, {
    x: MARGIN_L + (CONTENT_W - subW) / 2,
    y: top - 96,
    size: 10,
    font: ctx.font,
    color: GREY,
  });

  // Filet
  ctx.page.drawLine({
    start: { x: MARGIN_L + CONTENT_W / 2 - 40, y: top - 108 },
    end: { x: MARGIN_L + CONTENT_W / 2 + 40, y: top - 108 },
    thickness: 0.5,
    color: LIGHT_GREY,
  });

  // Ligne méta
  const dateStr = formatLongDate(t.starts_on, lang);
  const metaParts = [t.sport, t.category, dateStr, t.location?.trim() || I18N[lang].metaTbd]
    .filter(Boolean)
    .map((s) => safe(String(s)));
  const meta = metaParts.join(" · ");
  const metaW = ctx.font.widthOfTextAtSize(meta, 8.5);
  ctx.page.drawText(meta, {
    x: MARGIN_L + (CONTENT_W - metaW) / 2,
    y: top - 124,
    size: 8.5,
    font: ctx.font,
    color: GREY,
  });

  // Format · équipes
  const extra = safe(I18N[lang].formatTeams(t.format, t.num_teams));
  const extraW = ctx.font.widthOfTextAtSize(extra, 8.5);
  ctx.page.drawText(extra, {
    x: MARGIN_L + (CONTENT_W - extraW) / 2,
    y: top - 138,
    size: 8.5,
    font: ctx.font,
    color: GREY,
  });

  // Trait fin bas
  const bottom = top - 156;
  ctx.page.drawLine({
    start: { x: MARGIN_L, y: bottom },
    end: { x: MARGIN_L + CONTENT_W, y: bottom },
    thickness: 0.6,
    color: BLACK,
  });

  ctx.y = bottom;
}

function drawLogoCircle(ctx: Ctx, cx: number, cy: number, r: number, label: string) {
  ctx.page.drawCircle({ x: cx, y: cy, size: r, color: SOFT_BG, borderColor: LIGHT_GREY, borderWidth: 0.6 });
  const lines = label.split(" / ");
  const size = 6;
  lines.forEach((line, i) => {
    const w = ctx.font.widthOfTextAtSize(line, size);
    ctx.page.drawText(safe(line), {
      x: cx - w / 2,
      y: cy + (lines.length === 1 ? -2 : (i === 0 ? 2 : -6)),
      size,
      font: ctx.font,
      color: GREY,
    });
  });
}

function drawArticle(ctx: Ctx, n: number, paragraphs: string[]) {
  ensureSpace(ctx, 40);
  const title = `${I18N[ctx.lang].article} ${n}. ${I18N[ctx.lang].titles[n - 1]}`;
  ctx.page.drawText(safe(title), {
    x: MARGIN_L,
    y: ctx.y,
    size: 9.5,
    font: ctx.bold,
    color: BLACK,
  });
  ctx.y -= 6;
  ctx.page.drawLine({
    start: { x: MARGIN_L, y: ctx.y },
    end: { x: MARGIN_L + CONTENT_W, y: ctx.y },
    thickness: 0.4,
    color: LIGHT_GREY,
  });
  ctx.y -= 12;
  for (const p of paragraphs) drawParagraph(ctx, p);
}

function drawParagraph(ctx: Ctx, text: string) {
  const size = 9;
  const lh = 12.5;
  const lines = wrap(text, ctx.font, size, CONTENT_W);
  for (const line of lines) {
    ensureSpace(ctx, lh);
    ctx.page.drawText(safe(line), { x: MARGIN_L, y: ctx.y, size, font: ctx.font, color: BLACK });
    ctx.y -= lh;
  }
  ctx.y -= 4;
}

function drawBullets(ctx: Ctx, items: string[], opts: { numbered?: boolean } = {}) {
  const size = 9;
  const lh = 12.5;
  const indent = 14;
  for (const item of items) {
    const lines = wrap(item, ctx.font, size, CONTENT_W - indent);
    lines.forEach((line, idx) => {
      ensureSpace(ctx, lh);
      if (idx === 0) {
        const marker = opts.numbered ? "" : "—";
        if (marker) {
          ctx.page.drawText(marker, { x: MARGIN_L, y: ctx.y, size, font: ctx.font, color: GREY });
        }
      }
      ctx.page.drawText(safe(line), { x: MARGIN_L + indent, y: ctx.y, size, font: ctx.font, color: BLACK });
      ctx.y -= lh;
    });
  }
  ctx.y -= 4;
}

function drawItalicNote(ctx: Ctx, text: string) {
  ensureSpace(ctx, 40);
  ctx.y -= 6;
  const size = 8;
  const lh = 11;
  const lines = wrap(text, ctx.italic, size, CONTENT_W);
  for (const line of lines) {
    ensureSpace(ctx, lh);
    ctx.page.drawText(safe(line), { x: MARGIN_L, y: ctx.y, size, font: ctx.italic, color: GREY });
    ctx.y -= lh;
  }
}

function drawFooterOnAllPages(
  doc: PDFDocument,
  font: PDFFont,
  bold: PDFFont,
  lang: Lang,
  logo: import("pdf-lib").PDFImage | null,
) {
  const pages = doc.getPages();
  const total = pages.length;
  const dateStr = formatShortDate(new Date(), lang);
  pages.forEach((p, idx) => {
    p.drawLine({
      start: { x: MARGIN_L, y: MARGIN_B + 18 },
      end: { x: PAGE_W - MARGIN_R, y: MARGIN_B + 18 },
      thickness: 0.4,
      color: LIGHT_GREY,
    });
    const left = safe(I18N[lang].footerLeft(dateStr));
    p.drawText(left, { x: MARGIN_L, y: MARGIN_B + 6, size: 7, font, color: GREY });

    const right = safe(I18N[lang].footerRight);
    const rw = bold.widthOfTextAtSize(right, 7);
    let rightX = PAGE_W - MARGIN_R - rw;

    // Logo Clubero à gauche du texte "Powered by Clubero" (hauteur 10pt)
    if (logo) {
      const logoH = 10;
      const ratio = logo.width / logo.height;
      const logoW = logoH * ratio;
      const gap = 4;
      const totalW = logoW + gap + rw;
      const startX = PAGE_W - MARGIN_R - totalW;
      p.drawImage(logo, { x: startX, y: MARGIN_B + 4, width: logoW, height: logoH });
      rightX = startX + logoW + gap;
    }
    p.drawText(right, { x: rightX, y: MARGIN_B + 6, size: 7, font: bold, color: GREY });

    const pageLabel = `${I18N[lang].page} ${idx + 1} ${I18N[lang].of} ${total}`;
    const pw = font.widthOfTextAtSize(pageLabel, 7);
    p.drawText(pageLabel, { x: (PAGE_W - pw) / 2, y: MARGIN_B - 4, size: 7, font, color: GREY });
  });
}

// ───────────────────────────── helpers ─────────────────────────────

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN_B + 30) {
    ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
    ctx.pageNo += 1;
    ctx.y = PAGE_H - MARGIN_T;
  }
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  const paragraphs = text.split(/\n+/);
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > maxW && cur) {
        out.push(cur);
        cur = w;
      } else {
        cur = next;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

// Helvetica WinAnsi: remplace les caractères non encodables.
function safe(s: string): string {
  return s
    .replace(/–/g, "-")
    .replace(/—/g, "-")
    .replace(/’/g, "'")
    .replace(/‘/g, "'")
    .replace(/“|”/g, '"')
    .replace(/…/g, "...")
    .replace(/·/g, "·") // · is in WinAnsi (0xB7), keep
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function formatLongDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const months = I18N[lang].monthsLong;
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatShortDate(d: Date, lang: Lang): string {
  const months = I18N[lang].monthsShort;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
