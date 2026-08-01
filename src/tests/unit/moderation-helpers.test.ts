import { describe, it, expect } from "vitest";
import { pickModeratorIds, sortByCreatedAtDesc } from "@/lib/moderation-helpers";

describe("sortByCreatedAtDesc", () => {
  it("sorts newest first without mutating the input", () => {
    const items = [
      { id: "a", created_at: "2026-08-01T10:00:00Z" },
      { id: "b", created_at: "2026-08-01T12:00:00Z" },
      { id: "c", created_at: "2026-08-01T11:00:00Z" },
    ];
    const out = sortByCreatedAtDesc(items);
    expect(out.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

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
