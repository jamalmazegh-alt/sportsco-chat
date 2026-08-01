import { describe, it, expect } from "vitest";
import { pickModeratorIds } from "@/lib/moderation-helpers";

const m = (user_id: string | null, role: string | null = null, roles: string[] | null = null) => ({
  user_id,
  role,
  roles,
});

describe("pickModeratorIds", () => {
  it("keeps admins and dirigeants via primary role or roles[]", () => {
    const rows = [
      m("a", "admin"),
      m("b", "player"),
      m("c", null, ["dirigeant", "coach"]),
      m("d", "coach"),
    ];
    expect(pickModeratorIds(rows, [])).toEqual(["a", "c"]);
  });

  it("excludes the reporter and the reported user", () => {
    const rows = [m("a", "admin"), m("b", "dirigeant"), m("c", "admin")];
    expect(pickModeratorIds(rows, ["b", "c"])).toEqual(["a"]);
  });

  it("deduplicates and drops null user ids", () => {
    const rows = [m("a", "admin"), m("a", null, ["dirigeant"]), m(null, "admin")];
    expect(pickModeratorIds(rows, [])).toEqual(["a"]);
  });

  it("returns empty when the only moderator is the reported user", () => {
    const rows = [m("a", "admin"), m("b", "player")];
    expect(pickModeratorIds(rows, ["a"])).toEqual([]);
  });
});
