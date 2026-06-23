// Dispatcher UrgencyAction → effet UI.
// Mappe kind → handler. Reçoit un router (TanStack) et un remind runner
// injectés depuis le composant (pas de dépendance React ici, testable).
//
// Note : `remind-one` et `open-player` font partie de l'union pour la
// suite (payments, actions individuelles parent), mais aucune source
// actuelle ne les émet — donc pas de handler live, juste un throw
// explicite pour éviter le silence.

import type { UrgencyAction } from "./types";

export type UrgencyDispatchCtx = {
  navigate: (to: string) => void;
  remindAll: (eventId: string) => Promise<void>;
  remindOne?: (convocationId: string) => Promise<void>;
};

export async function dispatchUrgencyAction(
  action: UrgencyAction,
  ctx: UrgencyDispatchCtx,
): Promise<void> {
  switch (action.kind) {
    case "remind-all":
      await ctx.remindAll(action.eventId);
      return;
    case "respond":
    case "open-event":
      ctx.navigate(`/events/${action.eventId}`);
      return;
    case "open-player":
      ctx.navigate(`/players/${action.playerId}`);
      return;
    case "remind-one":
      if (!ctx.remindOne) {
        throw new Error("remind-one dispatched without handler (no live source emits it yet)");
      }
      await ctx.remindOne(action.convocationId);
      return;
  }
}
