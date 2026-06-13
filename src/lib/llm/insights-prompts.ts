/**
 * Pure, server-agnostic builders for coach-insight LLM prompts.
 *
 * GDPR guarantee: the only player-identifying text that ever reaches the LLM is
 * an opaque label ("Joueur A", "Joueur B", …) produced by `anonymizePlayers`.
 * Real names/emails/event titles NEVER appear in a prompt. After the LLM
 * answers, `rehydrateMessages` swaps the labels back to the real names — fully
 * server-side — so the coach still sees a personalised message.
 *
 * Kept free of any DB / network import so it can be unit-tested in isolation
 * (this is the file the parity test asserts against).
 */
import { anonymizePlayers } from "./core.server";

export interface AnonPrompt {
  /** Prompt sent to the LLM — labels only, no real PII. */
  prompt: string;
  /** label → real display name, applied to the LLM output server-side. */
  rehydrate: Record<string, string>;
}

export interface AnonPlayer {
  id: string;
  fullName: string;
}

/**
 * "3+ consecutive absences" insight — one subject player.
 */
export function buildConsecutiveAbsencePrompt(input: {
  player: AnonPlayer;
  absenceCount: number;
}): AnonPrompt {
  const { label } = anonymizePlayers([input.player.id]);
  const lab = label(input.player.id);
  return {
    prompt:
      `${lab} has been absent or no-show ${input.absenceCount} times in a row. ` +
      `Use ONLY the provided label (${lab}) verbatim — never invent or expand a real name. ` +
      `Generate a short alert suggesting the coach check in.`,
    rehydrate: { [lab]: input.player.fullName },
  };
}

/**
 * "Pending convocations within 48h" insight — N subject players.
 * The event title is intentionally NOT included (it can carry identifying info).
 */
export function buildPendingConvocationsPrompt(input: {
  players: AnonPlayer[];
  pendingCount: number;
}): AnonPrompt {
  const ids = input.players.map((p) => p.id);
  const { label } = anonymizePlayers(ids);
  const labels = ids.map((id) => label(id));
  const rehydrate: Record<string, string> = {};
  for (const p of input.players) {
    const lab = label(p.id);
    if (p.fullName) rehydrate[lab] = p.fullName;
  }
  return {
    prompt:
      `An upcoming match starts in less than 48h. ${input.pendingCount} players haven't ` +
      `responded yet: ${labels.join(", ")}. ` +
      `Use ONLY the provided labels (Joueur A, Joueur B, …) verbatim — never invent or expand real names. ` +
      `Generate a short alert message for the coach.`,
    rehydrate,
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace every anonymised label by its real value in the LLM output.
 * Runs server-side only; the LLM never saw the real values.
 */
export function rehydrateMessages(
  msgs: { fr: string; en: string },
  map: Record<string, string>,
): { fr: string; en: string } {
  let fr = msgs.fr;
  let en = msgs.en;
  // Replace longest labels first to avoid "Joueur A" clobbering "Joueur AA".
  const entries = Object.entries(map).sort((a, b) => b[0].length - a[0].length);
  for (const [lab, real] of entries) {
    const re = new RegExp(escapeRegExp(lab), "g");
    fr = fr.replace(re, real);
    en = en.replace(re, real);
  }
  return { fr, en };
}
