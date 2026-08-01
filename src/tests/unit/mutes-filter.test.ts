import { describe, it, expect } from "vitest";
import { filterMutedWallPosts, filterMutedMessages } from "@/lib/mutes";

const post = (author: string | null, extra?: object) => ({
  id: `post-${author}`,
  author_user_id: author,
  comments: [] as { author_user_id: string; reactions?: { user_id: string }[] }[],
  reactions: [] as { user_id: string }[],
  ...extra,
});

describe("filterMutedWallPosts", () => {
  it("returns posts unchanged when nobody is muted", () => {
    const posts = [post("a"), post("b")];
    expect(filterMutedWallPosts(posts, new Set())).toBe(posts);
  });

  it("removes posts authored by a muted user", () => {
    const posts = [post("a"), post("b"), post("c")];
    const out = filterMutedWallPosts(posts, new Set(["b"]));
    expect(out.map((p) => p.author_user_id)).toEqual(["a", "c"]);
  });

  it("keeps posts without author (external sources)", () => {
    const posts = [post(null), post("b")];
    const out = filterMutedWallPosts(posts, new Set(["b"]));
    expect(out.map((p) => p.author_user_id)).toEqual([null]);
  });

  it("strips comments and reactions from muted users on kept posts", () => {
    const posts = [
      post("a", {
        comments: [
          { author_user_id: "b", reactions: [{ user_id: "a" }, { user_id: "m" }] },
          { author_user_id: "m" },
        ],
        reactions: [{ user_id: "m" }, { user_id: "c" }],
      }),
    ];
    const out = filterMutedWallPosts(posts, new Set(["m"]));
    expect(out).toHaveLength(1);
    expect(out[0].comments).toHaveLength(1);
    expect(out[0].comments?.[0].author_user_id).toBe("b");
    expect(out[0].comments?.[0].reactions).toEqual([{ user_id: "a" }]);
    expect(out[0].reactions).toEqual([{ user_id: "c" }]);
  });

  it("leaves undefined comments/reactions untouched", () => {
    const posts = [{ id: "x", author_user_id: "a" }];
    const out = filterMutedWallPosts(posts, new Set(["m"]));
    expect(out[0]).toEqual({ id: "x", author_user_id: "a" });
  });
});

describe("filterMutedMessages", () => {
  it("returns messages unchanged when nobody is muted", () => {
    const msgs = [{ author_user_id: "a" }, { author_user_id: "b" }];
    expect(filterMutedMessages(msgs, new Set())).toBe(msgs);
  });

  it("removes messages from muted users", () => {
    const msgs = [{ author_user_id: "a" }, { author_user_id: "m" }, { author_user_id: "b" }];
    const out = filterMutedMessages(msgs, new Set(["m"]));
    expect(out.map((m) => m.author_user_id)).toEqual(["a", "b"]);
  });
});
