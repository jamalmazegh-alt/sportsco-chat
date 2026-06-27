import { describe, it, expect, vi } from "vitest";
import { dispatchUrgencyAction, type UrgencyDispatchCtx } from "./dispatcher";

function ctx(over: Partial<UrgencyDispatchCtx> = {}): UrgencyDispatchCtx {
  return {
    navigate: vi.fn(),
    remindAll: vi.fn(async () => {}),
    ...over,
  };
}

describe("dispatchUrgencyAction", () => {
  it("respond → navigate /events/E1", async () => {
    const c = ctx();
    await dispatchUrgencyAction({ kind: "respond", eventId: "E1" }, c);
    expect(c.navigate).toHaveBeenCalledWith("/events/E1");
  });

  it("open-event → navigate /events/E1", async () => {
    const c = ctx();
    await dispatchUrgencyAction({ kind: "open-event", eventId: "E1" }, c);
    expect(c.navigate).toHaveBeenCalledWith("/events/E1");
  });

  it("remind-all → délègue à ctx.remindAll(eventId) (rate-limit géré dans le helper, pas ici)", async () => {
    // Le helper remindAllForEvent applique le rate-limit 30min et retourne
    // le nombre d'envois effectifs (ex. 5 sur 7 → 2 ignorés). Au niveau
    // dispatcher on vérifie uniquement la délégation : la sémantique
    // "5 relancés, 2 ignorés" se teste sur le helper, pas ici.
    const remindAll = vi.fn(async () => {});
    const c = ctx({ remindAll });
    await dispatchUrgencyAction({ kind: "remind-all", eventId: "E1" }, c);
    expect(remindAll).toHaveBeenCalledTimes(1);
    expect(remindAll).toHaveBeenCalledWith("E1");
  });

  it("remind-one → throw explicite (handler non câblé, pas de no-op silencieux)", async () => {
    const c = ctx();
    await expect(
      dispatchUrgencyAction({ kind: "remind-one", convocationId: "C1" }, c),
    ).rejects.toThrow(/remind-one/);
  });

  it("open-player → throw explicite (handler non câblé, pas de no-op silencieux)", async () => {
    const c = ctx();
    await expect(dispatchUrgencyAction({ kind: "open-player", playerId: "P1" }, c)).rejects.toThrow(
      /open-player/,
    );
  });
});
