// Lightweight WhatsApp deep-link helpers (V1 — no Business API).
// We rely on `https://wa.me/?text=...` which opens WhatsApp's share-sheet so
// the coach picks the destination (team group / contact) and taps Send.

import { format as dfFormat } from "date-fns";
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

function mapsUrlFor(location?: string | null, locationUrl?: string | null) {
  if (locationUrl) return locationUrl;
  if (!location) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

function wazeUrlFor(location?: string | null) {
  if (!location) return null;
  return `https://www.waze.com/ul?q=${encodeURIComponent(location)}&navigate=yes`;
}

function pushNavLinks(lines: string[], location?: string | null, locationUrl?: string | null) {
  const m = mapsUrlFor(location, locationUrl);
  const w = wazeUrlFor(location);
  if (m) lines.push(`🗺️ Google Maps : ${m}`);
  if (w) lines.push(`🚗 Waze : ${w}`);
}

function emojiForType(type?: string | null) {
  switch (type) {
    case "match": return "⚽";
    case "training": return "🏋️";
    case "tournament": return "🏆";
    case "friendly": return "🤝";
    case "meeting": return "📋";
    default: return "📅";
  }
}

export function buildConvocationMessage(input: WhatsAppEventInput): string {
  const loc = resolveLocale(input.locale);
  const d = DICTS[loc];
  const lines: string[] = [];
  const emoji = emojiForType(input.type);
  const header = input.type === "match" && input.opponent
    ? `${emoji} *${input.teamName ?? ""}${input.teamName ? " " : ""}vs ${input.opponent}*`
    : `${emoji} *${input.title ?? d.convocation}*`;
  lines.push(header);
  if (input.clubName || input.teamName) {
    lines.push(`_${[input.clubName, input.teamName].filter(Boolean).join(" · ")}_`);
  }
  if (input.competitionLabel) lines.push(`🏅 ${input.competitionLabel}`);
  if (input.type === "match" && input.isHome != null) {
    lines.push(input.isHome ? d.home : d.away);
  }
  lines.push("");

  const date = fmtWith(input.startsAt, d.datePattern, loc);
  if (date) lines.push(`📅 ${date}`);
  const convoc = fmtWith(input.convocationTime, d.timePattern, loc);
  if (convoc) lines.push(`⏰ ${d.meetingTime} : ${convoc}`);
  const end = fmtWith(input.endsAt, d.timePattern, loc);
  if (end) lines.push(`🕒 ${d.endTime} : ${end}`);

  if (input.location) {
    lines.push(`📍 ${input.location}`);
    pushNavLinks(lines, input.location, input.locationUrl);
  }
  if (input.meetingPoint) {
    lines.push(`🚌 ${d.meetingPoint} : ${input.meetingPoint}`);
  }

  if (input.description) {
    lines.push("");
    lines.push(input.description);
  }

  if (input.selectedPlayers && input.selectedPlayers.length > 0) {
    lines.push("");
    lines.push(d.squad(input.selectedPlayers.length));
    for (const n of input.selectedPlayers) lines.push(`• ${n}`);
  }

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
    pushNavLinks(lines, input.location, input.locationUrl);
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
    pushNavLinks(lines, input.location, input.locationUrl);
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
      if (uncertain.length) lines.push(`❔ ${d.uncertain} (${uncertain.length}) : ${uncertain.join(", ")}`);
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
    window.open(url, "_blank", "noopener,noreferrer");
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
