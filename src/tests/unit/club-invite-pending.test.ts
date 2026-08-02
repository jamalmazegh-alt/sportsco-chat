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
  buildClubInviteAuthMetadata,
  clearPendingClubInvite,
  clubInviteAuthMetadataClear,
  clubInviteErrorMessage,
  readInvitePayloadFromMetadata,
  readInviteTokenFromLocation,
  readPendingClubInvite,
  redeemClubInvite,
  resolvePendingInviteToken,
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

  it("replays flat user_metadata when localStorage is empty (other device)", async () => {
    const meta = buildClubInviteAuthMetadata("tok-meta", {
      mode: "child",
      childFirstName: "Victor",
      childLastName: "Osim",
      childBirthDate: "2014-05-01",
      license: "LIC-V",
      phone: "0612345678",
    });

    const { error } = await redeemClubInvite("tok-meta", { userMetadata: meta });
    expect(error).toBeNull();
    expect(rpc).toHaveBeenCalledWith(
      "redeem_club_invite_v2",
      expect.objectContaining({
        _token: "tok-meta",
        _mode: "child",
        _child_first_name: "Victor",
        _child_last_name: "Osim",
        _child_birth_date: "2014-05-01",
        _license: "LIC-V",
        _phone: "0612345678",
      }),
    );
  });

  it("still accepts the legacy nested club_invite_payload blob", () => {
    const parsed = readInvitePayloadFromMetadata("tok-nested", {
      club_invite_payload: {
        token: "tok-nested",
        mode: "child",
        childFirstName: "Victor",
        childLastName: "Osim",
        childBirthDate: "2014-05-01",
      },
    });
    expect(parsed).toEqual({
      mode: "child",
      birthDate: null,
      phone: null,
      license: null,
      childFirstName: "Victor",
      childLastName: "Osim",
      childBirthDate: "2014-05-01",
      childPhone: null,
    });
  });

  it("fails fast when metadata says child but names are missing", async () => {
    const { error } = await redeemClubInvite("tok-bad", {
      userMetadata: { club_invite_mode: "child" },
    });
    expect(error?.message).toBe("Child name required");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("dedupes parallel redeem calls for the same token", async () => {
    let release!: () => void;
    rpc.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ data: "club-id", error: null });
        }),
    );
    storePendingClubInvite("tok-race", {
      mode: "child",
      childFirstName: "Victor",
      childLastName: "Osim",
      childBirthDate: "2014-05-01",
    });

    const a = redeemClubInvite("tok-race");
    const b = redeemClubInvite("tok-race");
    release();
    await Promise.all([a, b]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("builds a clear-metadata patch that nulls invite fields", () => {
    const clear = clubInviteAuthMetadataClear();
    expect(clear.invite_token).toBeNull();
    expect(clear.club_invite_mode).toBeNull();
    expect(clear.club_invite_payload).toBeNull();
    expect(clear.club_invite_child_first_name).toBeNull();
  });

  it("reads invite token from a location search string", () => {
    expect(readInviteTokenFromLocation("?invite=abc-123&next=/home")).toBe("abc-123");
    expect(readInviteTokenFromLocation("invite=abc-123")).toBe("abc-123");
    expect(readInviteTokenFromLocation("?next=/home")).toBeNull();
    expect(readInviteTokenFromLocation("")).toBeNull();
  });

  it("resolves pending invite from metadata first, then URL", () => {
    expect(resolvePendingInviteToken({ invite_token: "from-meta" }, "?invite=from-url")).toBe(
      "from-meta",
    );
    expect(resolvePendingInviteToken({}, "?invite=from-url")).toBe("from-url");
    expect(resolvePendingInviteToken({ invite_token: "  " }, "?invite=from-url")).toBe("from-url");
    expect(resolvePendingInviteToken(null, "?next=/home")).toBeNull();
  });
});
