import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

// Minimal localStorage polyfill — vitest runs in node.
const store = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    },
  },
  configurable: true,
});

import {
  clearPendingClubInvite,
  clubInviteErrorMessage,
  readPendingClubInvite,
  redeemClubInvite,
  storePendingClubInvite,
} from "@/lib/club-invite-pending";

describe("club-invite-pending", () => {
  beforeEach(() => {
    store.clear();
    rpc.mockReset();
    rpc.mockResolvedValue({ data: "club-id", error: null });
  });

  it("stores and reads the pending payload keyed by token", () => {
    storePendingClubInvite("tok-1", {
      mode: "child",
      childFirstName: "Léa",
      childLastName: "Martin",
      childBirthDate: "2015-04-01",
    });
    expect(readPendingClubInvite("tok-1")).toEqual({
      mode: "child",
      childFirstName: "Léa",
      childLastName: "Martin",
      childBirthDate: "2015-04-01",
    });
    expect(readPendingClubInvite("other")).toBeNull();
  });

  it("redeems via redeem_club_invite_v2 and clears storage on success", async () => {
    storePendingClubInvite("tok-2", {
      mode: "self",
      birthDate: "2008-01-02",
      phone: "0600000000",
      license: "LIC-1",
    });

    const { error } = await redeemClubInvite("tok-2");
    expect(error).toBeNull();
    expect(rpc).toHaveBeenCalledWith("redeem_club_invite_v2", {
      _token: "tok-2",
      _mode: "self",
      _birth_date: "2008-01-02",
      _phone: "0600000000",
      _license: "LIC-1",
      _child_first_name: undefined,
      _child_last_name: undefined,
      _child_birth_date: undefined,
    });
    expect(readPendingClubInvite("tok-2")).toBeNull();
  });

  it("keeps the pending payload when the RPC fails", async () => {
    storePendingClubInvite("tok-3", { mode: "self", birthDate: "2008-01-02" });
    rpc.mockResolvedValue({ data: null, error: { message: "Invite expired" } });

    const { error } = await redeemClubInvite("tok-3");
    expect(error?.message).toBe("Invite expired");
    expect(readPendingClubInvite("tok-3")?.birthDate).toBe("2008-01-02");
  });

  it("defaults to self mode when nothing was stored", async () => {
    await redeemClubInvite("tok-4");
    expect(rpc).toHaveBeenCalledWith(
      "redeem_club_invite_v2",
      expect.objectContaining({ _token: "tok-4", _mode: "self" }),
    );
  });

  it("clearPendingClubInvite removes only the targeted token", () => {
    storePendingClubInvite("a", { mode: "self" });
    storePendingClubInvite("b", { mode: "child" });
    clearPendingClubInvite("a");
    expect(readPendingClubInvite("a")).toBeNull();
    expect(readPendingClubInvite("b")?.mode).toBe("child");
  });

  it("never replays a redeemed token as self (no duplicate player for a parent)", async () => {
    storePendingClubInvite("tok-5", {
      mode: "child",
      childFirstName: "Lamine",
      childLastName: "Yamal",
      childBirthDate: "2015-08-02",
    });
    await redeemClubInvite("tok-5");
    expect(rpc).toHaveBeenCalledTimes(1);

    // Second path (metadata replay / login redirect) must be a no-op.
    const { error } = await redeemClubInvite("tok-5");
    expect(error).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });


  it("maps player_already_linked to the i18n key", () => {
    const t = (key: string) => (key === "auth.playerAlreadyLinked" ? "linked" : key);
    expect(clubInviteErrorMessage({ message: "player_already_linked" }, t)).toBe("linked");
    expect(clubInviteErrorMessage({ message: "Invite expired" }, t)).toBe("Invite expired");
  });
});
