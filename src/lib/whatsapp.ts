// Lightweight WhatsApp deep-link helpers (V1 — no Business API).
// We rely on `https://wa.me/?text=...` which opens WhatsApp's share-sheet so
// the coach picks the destination (team group / contact) and taps Send.

import { format as dfFormat } from "date-fns";
import { openInSystemApp } from "@/lib/open-url";
import { fr, enUS } from "date-fns/locale";
import i18n from "@/lib/i18n";

export type WaLocale = "fr" | "en";

function resolveLocale(locale?: WaLocale): WaLocale {
  if (locale) return locale;
  const lang = (i18n.language ?? "en").toLowerCase();
  return lang.startsWith("fr") ? "fr" : "en";
}

type Dict = {
  convocation: string;
  reminder: string;
  cancelled: string;
  rescheduled: string;
  event: string;
  home: string;
  away: string;
  meetingTime: string; // "Convocation :" label inside message body
  endTime: string;
  meetingPoint: string;
  coachLabel: string;
  squad: (n: number) => string;
  lineup: (formation?: string) => string;
  startingXI: string;
  bench: string;
  documents: string;
  document: string;
  sentVia: string;
  reason: string;
  previousDate: string;
  newDate: string;
  responses: string;
  present: string;
  absent: string;
  uncertain: string;
  notRespondedYet: (n: number) => string;
  thanksConfirm: string;
  datePattern: string;
  timePattern: string;
};

const DICTS: Record<WaLocale, Dict> = {
  fr: {
    convocation: "Convocation",
    reminder: "Rappel",
    cancelled: "Annulé",
    rescheduled: "Reporté",
    event: "Événement",
    home: "🏠 Domicile",
    away: "✈️ Extérieur",
    meetingTime: "Convocation",
    endTime: "Fin prévue",
    meetingPoint: "RDV",
    coachLabel: "Coach",

    squad: (n) => `👥 *Convoqués (${n})*`,
    lineup: (f) => `⚽ *Composition prévue${f ? ` (${f})` : ""}*`,
    startingXI: "_XI de départ_",
    bench: "_Remplaçants_",
    documents: "📎 Documents :",
    document: "Document",
    sentVia: "— envoyé via Clubero",
    reason: "Motif",
    previousDate: "Ancienne date",
    newDate: "Nouvelle date",
    responses: "📊 *Réponses*",
    present: "Présents",
    absent: "Absents",
    uncertain: "Incertains",
    notRespondedYet: (n) => `⏳ *Pas encore répondu (${n})*`,
    thanksConfirm: "Merci de confirmer votre présence 🙏",
    datePattern: "EEEE d MMMM 'à' HH'h'mm",
    timePattern: "HH'h'mm",
  },
  en: {
    convocation: "Call-up",
    reminder: "Reminder",
    cancelled: "Cancelled",
    rescheduled: "Rescheduled",
    event: "Event",
    home: "🏠 Home",
    away: "✈️ Away",
    meetingTime: "Meeting time",
    endTime: "Ends at",
    meetingPoint: "Meeting point",
    coachLabel: "Coach",

    squad: (n) => `👥 *Squad (${n})*`,
    lineup: (f) => `⚽ *Planned line-up${f ? ` (${f})` : ""}*`,
    startingXI: "_Starting XI_",
    bench: "_Bench_",
    documents: "📎 Documents:",
    document: "Document",
    sentVia: "— sent via Clubero",
    reason: "Reason",
    previousDate: "Previous date",
    newDate: "New date",
    responses: "📊 *Responses*",
    present: "Present",
    absent: "Absent",
    uncertain: "Uncertain",
    notRespondedYet: (n) => `⏳ *Not yet responded (${n})*`,
    thanksConfirm: "Please confirm your attendance 🙏",
    datePattern: "EEEE, MMMM d 'at' h:mm a",
    timePattern: "h:mm a",
  },
};

function fmtWith(iso: string | null | undefined, pattern: string, locale: WaLocale) {
  if (!iso) return null;
  try {
    return dfFormat(new Date(iso), pattern, { locale: locale === "fr" ? fr : enUS });
  } catch {
    return iso;
  }
}

export type WhatsAppLineupPlayer = {
  name: string;
  jersey?: number | null;
  role?: string | null;
  isCaptain?: boolean;
  isGK?: boolean;
};

export type WhatsAppLineup = {
  formation?: string | null;
  starting?: WhatsAppLineupPlayer[];
  bench?: WhatsAppLineupPlayer[];
};

export type WhatsAppEventInput = {
  clubName?: string | null;
  teamName?: string | null;
  type?: string | null; // training | match | ...
  title?: string | null;
  opponent?: string | null;
  isHome?: boolean | null;
  competitionLabel?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  convocationTime?: string | null;
  location?: string | null;
  locationUrl?: string | null;
  meetingPoint?: string | null;
  coachNames?: string[] | null;

  description?: string | null;
  attachments?: Array<{ name?: string; url?: string }> | null;
  selectedPlayers?: string[]; // names
  cancellationReason?: string | null;
  previousStart?: string | null; // for reschedule
  lineup?: WhatsAppLineup | null;
  respondents?: {
    present?: string[];
    absent?: string[];
    uncertain?: string[];
    pending?: string[];
  } | null;
  locale?: WaLocale;
};

/** Adresse compacte pour les URLs de navigation (évite les liens à rallonge). */
function shortQuery(location: string) {
  // On coupe après le complément de lieu ("– Terrain principal", "(portail B)"…)
  const base = location.split(/\s[–—|(]\s?/)[0] ?? location;
  return base.trim().slice(0, 80) || location.trim();
}

function mapsUrlFor(location?: string | null, locationUrl?: string | null) {
  // On privilégie une URL courte construite depuis l'adresse (les liens
  // Google Maps « search?api=1&query=… » sont illisibles dans WhatsApp).
  if (location) return `https://maps.google.com/?q=${encodeURIComponent(shortQuery(location))}`;
  return locationUrl ?? null;
}

function wazeUrlFor(location?: string | null) {
  if (!location) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(shortQuery(location))}`;
}

function pushNavLinks(
  lines: string[],
  location?: string | null,
  locationUrl?: string | null,
  locale: WaLocale = "fr",
) {
  const m = mapsUrlFor(location, locationUrl);
  const w = wazeUrlFor(location);
  const labels = {
    fr: { maps: "Google Maps", waze: "Waze" },
    en: { maps: "Google Maps", waze: "Waze" },
  };
  const label = labels[locale];
  if (m) lines.push(`🗺️ ${label.maps} : ${m}`);
  if (w) lines.push(`🚗 ${label.waze} : ${w}`);
}

function emojiForType(type?: string | null) {
  switch (type) {
    case "match":
      return "⚽";
    case "training":
      return "🏋️";
    case "tournament":
      return "🏆";
    case "friendly":
      return "🤝";
    case "meeting":
      return "📋";
    default:
      return "📅";
  }
}

function dateCard(iso: string | null | undefined, locale: WaLocale) {
  if (!iso) return null;
  try {
    const date = new Date(iso);
    const loc = locale === "fr" ? fr : enUS;
    return {
      weekday: dfFormat(date, "EEEE", { locale: loc }),
      day: dfFormat(date, "d", { locale: loc }),
      month: dfFormat(date, "MMMM", { locale: loc }),
      time: dfFormat(date, locale === "fr" ? "HH'h'mm" : "h:mm a", { locale: loc }),
    };
  } catch {
    return null;
  }
}

function durationLabel(input: WhatsAppEventInput, locale: WaLocale): string | null {
  const { type, startsAt, endsAt } = input;
  if (!startsAt || !endsAt) return null;
  try {
    const start = new Date(startsAt).getTime();
    const end = new Date(endsAt).getTime();
    const minutes = Math.round((end - start) / 60000);
    if (minutes <= 0) return null;
    if (locale === "fr") {
      if (type === "match") {
        if (minutes === 90) return "11v11 · 2x45 min";
        if (minutes === 80) return "11v11 · 2x40 min";
      }
      return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
    }
    // EN
    if (type === "match") {
      if (minutes === 90) return "11v11 · 2x45 min";
      if (minutes === 80) return "11v11 · 2x40 min";
    }
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h${m ? String(m).padStart(2, "0") : ""}`;
  } catch {
    return null;
  }
}

export function buildConvocationMessage(input: WhatsAppEventInput): string {
  const loc = resolveLocale(input.locale);
  const d = DICTS[loc];
  const lines: string[] = [];
  const emoji = emojiForType(input.type);

  // ── Header: badges + match title ─────────────────────────────
  const matchBadges: string[] = [];
  if (input.competitionLabel) matchBadges.push(`🏆 ${input.competitionLabel}`);
  if (input.type === "match" && input.isHome != null) {
    matchBadges.push(input.isHome ? d.home : d.away);
  }

  const title =
    input.type === "match" && input.opponent
      ? `${input.teamName ?? input.clubName ?? ""}${input.teamName ? " " : ""}vs ${input.opponent}`
      : (input.title ?? d.convocation);
  lines.push(`${emoji} *${title}*`);

  if (matchBadges.length > 0) lines.push(matchBadges.join(" · "));
  {
    // On évite de répéter club/équipe déjà présents dans le titre.
    const titleLower = title.toLowerCase();
    const parts = [input.clubName, input.teamName]
      .filter((p): p is string => !!p && !titleLower.includes(p.toLowerCase()))
      .filter((p, i, arr) => arr.indexOf(p) === i);
    if (parts.length > 0) lines.push(`_${parts.join(" · ")}_`);
  }
  lines.push("");

  // ── Date / time block ────────────────────────────────────────
  const card = dateCard(input.startsAt, loc);
  if (card) {
    const startLabel =
      input.type === "match" || input.type === "friendly"
        ? loc === "fr"
          ? "Coup d'envoi"
          : "Kick-off"
        : loc === "fr"
          ? "Début"
          : "Start";
    lines.push(`🗓️ *${card.weekday} ${card.day} ${card.month}* — ${startLabel} ${card.time}`);
  }
  const end = fmtWith(input.endsAt, d.timePattern, loc);
  if (end) lines.push(`🕒 ${d.endTime} : ${end}`);

  // ── Lieu du match + navigation ───────────────────────────────
  if (input.location) {
    lines.push("");
    const venueLabel =
      input.type === "match" || input.type === "friendly"
        ? loc === "fr"
          ? "Lieu du match"
          : "Match venue"
        : loc === "fr"
          ? "Lieu"
          : "Venue";
    lines.push(`📍 *${venueLabel}*`);
    lines.push(input.location);
    pushNavLinks(lines, input.location, input.locationUrl, loc);
  }

  // ── Rendez-vous (horaire + lieu de RDV) ──────────────────────
  const convoc = fmtWith(input.convocationTime, d.timePattern, loc);
  if (convoc || input.meetingPoint) {
    lines.push("");
    lines.push(`🚌 *${loc === "fr" ? "Rendez-vous" : "Meeting"}*`);
    if (convoc) lines.push(`⏰ ${d.meetingTime} : ${convoc}`);
    if (input.meetingPoint) {
      lines.push(`📍 ${input.meetingPoint}`);
      const sameAsVenue =
        !!input.location &&
        input.meetingPoint.trim().toLowerCase() === input.location.trim().toLowerCase();
      if (!sameAsVenue) pushNavLinks(lines, input.meetingPoint, null, loc);
    }
  }

  if (input.coachNames && input.coachNames.length > 0) {
    lines.push("");
    lines.push(`👤 ${d.coachLabel} : ${input.coachNames.join(", ")}`);
  }

  if (input.description) {
    lines.push("");
    lines.push(input.description);
  }

  // ── Squad ─────────────────────────────────────────────────────
  if (input.selectedPlayers && input.selectedPlayers.length > 0) {
    lines.push("");
    lines.push(d.squad(input.selectedPlayers.length));
    for (const n of input.selectedPlayers) lines.push(`• ${n}`);
  }

  // ── Lineup ───────────────────────────────────────────────────
  const lu = input.lineup;
  if (lu && ((lu.starting?.length ?? 0) > 0 || (lu.bench?.length ?? 0) > 0)) {
    lines.push("");
    lines.push(d.lineup(lu.formation ?? undefined));
    if (lu.starting && lu.starting.length > 0) {
      lines.push(d.startingXI);
      for (const p of lu.starting) {
        const num = p.jersey != null ? `#${p.jersey} ` : "";
        const role = p.role ? `[${p.role}] ` : "";
        const marks = `${p.isCaptain ? " (C)" : ""}${p.isGK ? " 🧤" : ""}`;
        lines.push(`• ${role}${num}${p.name}${marks}`);
      }
    }
    if (lu.bench && lu.bench.length > 0) {
      lines.push(d.bench);
      for (const p of lu.bench) {
        const num = p.jersey != null ? `#${p.jersey} ` : "";
        lines.push(`• ${num}${p.name}`);
      }
    }
  }

  // ── Attachments ──────────────────────────────────────────────
  const att = (input.attachments ?? []).filter((a) => a?.url);
  if (att.length > 0) {
    lines.push("");
    lines.push(d.documents);
    for (const a of att) lines.push(`• ${a.name ?? d.document} — ${a.url}`);
  }

  lines.push("");
  lines.push(d.sentVia);

  return lines.join("\n");
}

export function buildCancellationMessage(input: WhatsAppEventInput): string {
  const loc = resolveLocale(input.locale);
  const d = DICTS[loc];
  const lines: string[] = [];
  lines.push(`❌ *${d.cancelled}* — ${input.title ?? d.event}`);
  if (input.clubName || input.teamName) {
    lines.push(`_${[input.clubName, input.teamName].filter(Boolean).join(" · ")}_`);
  }
  const date = fmtWith(input.startsAt, d.datePattern, loc);
  if (date) lines.push(`📅 ${date}`);
  if (input.cancellationReason) {
    lines.push("");
    lines.push(`${d.reason} : ${input.cancellationReason}`);
  }
  lines.push("");
  lines.push(d.sentVia);
  return lines.join("\n");
}

export function buildRescheduleMessage(input: WhatsAppEventInput): string {
  const loc = resolveLocale(input.locale);
  const d = DICTS[loc];
  const lines: string[] = [];
  lines.push(`🔁 *${d.rescheduled}* — ${input.title ?? d.event}`);
  if (input.clubName || input.teamName) {
    lines.push(`_${[input.clubName, input.teamName].filter(Boolean).join(" · ")}_`);
  }
  const prev = fmtWith(input.previousStart, d.datePattern, loc);
  const next = fmtWith(input.startsAt, d.datePattern, loc);
  if (prev) lines.push(`${d.previousDate} : ${prev}`);
  if (next) lines.push(`${d.newDate} : ${next}`);
  if (input.location) {
    lines.push(`📍 ${input.location}`);
    pushNavLinks(lines, input.location, input.locationUrl, loc);
  }
  if (input.cancellationReason) {
    lines.push("");
    lines.push(input.cancellationReason);
  }
  lines.push("");
  lines.push(d.sentVia);
  return lines.join("\n");
}

export function buildReminderMessage(input: WhatsAppEventInput): string {
  const loc = resolveLocale(input.locale);
  const d = DICTS[loc];
  const lines: string[] = [];
  lines.push(`🔔 *${d.reminder}* — ${input.title ?? d.event}`);
  const date = fmtWith(input.startsAt, d.datePattern, loc);
  if (date) lines.push(`📅 ${date}`);
  const convoc = fmtWith(input.convocationTime, d.timePattern, loc);
  if (convoc) lines.push(`⏰ ${d.meetingTime} : ${convoc}`);
  if (input.location) {
    lines.push(`📍 ${input.location}`);
    pushNavLinks(lines, input.location, input.locationUrl, loc);
  }

  const r = input.respondents;
  if (r) {
    const present = r.present ?? [];
    const absent = r.absent ?? [];
    const uncertain = r.uncertain ?? [];
    const pending = r.pending ?? [];
    if (present.length + absent.length + uncertain.length + pending.length > 0) {
      lines.push("");
      lines.push(d.responses);
      if (present.length) lines.push(`✅ ${d.present} (${present.length}) : ${present.join(", ")}`);
      if (absent.length) lines.push(`❌ ${d.absent} (${absent.length}) : ${absent.join(", ")}`);
      if (uncertain.length)
        lines.push(`❔ ${d.uncertain} (${uncertain.length}) : ${uncertain.join(", ")}`);
      if (pending.length) {
        lines.push("");
        lines.push(d.notRespondedYet(pending.length));
        for (const n of pending) lines.push(`• ${n}`);
        lines.push("");
        lines.push(d.thanksConfirm);
      }
    }
  } else {
    lines.push("");
    lines.push(d.thanksConfirm);
  }
  lines.push(d.sentVia);
  return lines.join("\n");
}

/**
 * Build a `wa.me` share link. WhatsApp opens its share-sheet so the user picks
 * the destination (the configured team group, or any contact). This is the
 * V1 approach: no Business API, no server-side messaging.
 */
export function waShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * Open WhatsApp with a prefilled message. Returns the URL used (handy for
 * tests / copy-to-clipboard fallback).
 */
export function openWhatsAppShare(message: string): string {
  const url = waShareUrl(message);
  if (typeof window !== "undefined") {
    openInSystemApp(url);
  }
  return url;
}

/** Normalize a stored group URL — accept `chat.whatsapp.com/XXX` shortcuts. */
export function normalizeGroupUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^chat\.whatsapp\.com\//i.test(v)) return `https://${v}`;
  return v;
}
