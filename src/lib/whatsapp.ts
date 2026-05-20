// Lightweight WhatsApp deep-link helpers (V1 — no Business API).
// We rely on `https://wa.me/?text=...` which opens WhatsApp's share-sheet so
// the coach picks the destination (team group / contact) and taps Send.

import { fmt } from "@/lib/date-locale";

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

function fmtDate(iso?: string | null) {
  if (!iso) return null;
  try {
    return fmt(iso, "EEEE d MMMM 'à' HH'h'mm");
  } catch {
    return iso;
  }
}

function fmtTime(iso?: string | null) {
  if (!iso) return null;
  try {
    return fmt(iso, "HH'h'mm");
  } catch {
    return iso;
  }
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
  const lines: string[] = [];
  const emoji = emojiForType(input.type);
  const header = input.type === "match" && input.opponent
    ? `${emoji} *${input.teamName ?? ""}${input.teamName ? " " : ""}vs ${input.opponent}*`
    : `${emoji} *${input.title ?? "Convocation"}*`;
  lines.push(header);
  if (input.clubName || input.teamName) {
    lines.push(`_${[input.clubName, input.teamName].filter(Boolean).join(" · ")}_`);
  }
  if (input.competitionLabel) lines.push(`🏅 ${input.competitionLabel}`);
  if (input.type === "match" && input.isHome != null) {
    lines.push(input.isHome ? "🏠 Domicile" : "✈️ Extérieur");
  }
  lines.push("");

  const date = fmtDate(input.startsAt);
  if (date) lines.push(`📅 ${date}`);
  const convoc = fmtTime(input.convocationTime);
  if (convoc) lines.push(`⏰ Convocation : ${convoc}`);
  const end = fmtTime(input.endsAt);
  if (end) lines.push(`🕒 Fin prévue : ${end}`);

  if (input.location) {
    lines.push(`📍 ${input.location}`);
    pushNavLinks(lines, input.location, input.locationUrl);
  }
  if (input.meetingPoint) {
    lines.push(`🚌 RDV : ${input.meetingPoint}`);
  }

  if (input.description) {
    lines.push("");
    lines.push(input.description);
  }

  if (input.selectedPlayers && input.selectedPlayers.length > 0) {
    lines.push("");
    lines.push(`👥 *Convoqués (${input.selectedPlayers.length})*`);
    for (const n of input.selectedPlayers) lines.push(`• ${n}`);
  }

  const lu = input.lineup;
  if (lu && ((lu.starting?.length ?? 0) > 0 || (lu.bench?.length ?? 0) > 0)) {
    lines.push("");
    lines.push(`⚽ *Composition prévue${lu.formation ? ` (${lu.formation})` : ""}*`);
    if (lu.starting && lu.starting.length > 0) {
      lines.push(`_XI de départ_`);
      for (const p of lu.starting) {
        const num = p.jersey != null ? `#${p.jersey} ` : "";
        const role = p.role ? `[${p.role}] ` : "";
        const marks = `${p.isCaptain ? " (C)" : ""}${p.isGK ? " 🧤" : ""}`;
        lines.push(`• ${role}${num}${p.name}${marks}`);
      }
    }
    if (lu.bench && lu.bench.length > 0) {
      lines.push(`_Remplaçants_`);
      for (const p of lu.bench) {
        const num = p.jersey != null ? `#${p.jersey} ` : "";
        lines.push(`• ${num}${p.name}`);
      }
    }
  }


  const att = (input.attachments ?? []).filter((a) => a?.url);
  if (att.length > 0) {
    lines.push("");
    lines.push("📎 Documents :");
    for (const a of att) lines.push(`• ${a.name ?? "Document"} — ${a.url}`);
  }

  lines.push("");
  lines.push("— envoyé via Clubero");

  return lines.join("\n");
}

export function buildCancellationMessage(input: WhatsAppEventInput): string {
  const lines: string[] = [];
  lines.push(`❌ *Annulé* — ${input.title ?? "Événement"}`);
  if (input.clubName || input.teamName) {
    lines.push(`_${[input.clubName, input.teamName].filter(Boolean).join(" · ")}_`);
  }
  const date = fmtDate(input.startsAt);
  if (date) lines.push(`📅 ${date}`);
  if (input.cancellationReason) {
    lines.push("");
    lines.push(`Motif : ${input.cancellationReason}`);
  }
  lines.push("");
  lines.push("— envoyé via Clubero");
  return lines.join("\n");
}

export function buildRescheduleMessage(input: WhatsAppEventInput): string {
  const lines: string[] = [];
  lines.push(`🔁 *Reporté* — ${input.title ?? "Événement"}`);
  if (input.clubName || input.teamName) {
    lines.push(`_${[input.clubName, input.teamName].filter(Boolean).join(" · ")}_`);
  }
  const prev = fmtDate(input.previousStart);
  const next = fmtDate(input.startsAt);
  if (prev) lines.push(`Ancienne date : ${prev}`);
  if (next) lines.push(`Nouvelle date : ${next}`);
  if (input.location) {
    lines.push(`📍 ${input.location}`);
    pushNavLinks(lines, input.location, input.locationUrl);
  }
  if (input.cancellationReason) {
    lines.push("");
    lines.push(input.cancellationReason);
  }
  lines.push("");
  lines.push("— envoyé via Clubero");
  return lines.join("\n");
}

export function buildReminderMessage(input: WhatsAppEventInput): string {
  const lines: string[] = [];
  lines.push(`🔔 *Rappel* — ${input.title ?? "Événement"}`);
  const date = fmtDate(input.startsAt);
  if (date) lines.push(`📅 ${date}`);
  const convoc = fmtTime(input.convocationTime);
  if (convoc) lines.push(`⏰ Convocation : ${convoc}`);
  if (input.location) {
    lines.push(`📍 ${input.location}`);
    pushNavLinks(lines, input.location, input.locationUrl);
  }
  lines.push("");
  lines.push("Merci de confirmer votre présence 🙏");
  lines.push("— envoyé via Clubero");
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
