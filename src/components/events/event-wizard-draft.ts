/**
 * Auto-saved draft for the event wizard.
 * Mirrors the pattern used by TournamentAIAssistant (sessionStorage).
 */
import type { EventWizardState } from "./event-wizard-config";

const KEY = "clubero:event-wizard-draft";

export function readDraft(): EventWizardState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EventWizardState;
  } catch {
    return null;
  }
}

export function writeDraft(state: EventWizardState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // quota / private mode → silently ignore
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function draftHasProgress(s: EventWizardState | null): boolean {
  if (!s) return false;
  // Any answer beyond initial defaults counts as progress.
  return Boolean(
    s.type || s.teamId || s.startDate || s.opponent || s.location || s.recurrence?.mode,
  );
}
