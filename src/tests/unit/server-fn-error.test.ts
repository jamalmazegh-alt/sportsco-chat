import { describe, it, expect } from "vitest";
import { getServerFnErrorCode, serverFnError } from "@/lib/server-fn-error";

describe("server-fn-error", () => {
  it("serverFnError puts stable code in JSON body", async () => {
    const res = serverFnError("bracket_progression_failed", 500);
    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({ error: "bracket_progression_failed" });
  });

  it("getServerFnErrorCode reads code from JSON message, not plain text", () => {
    expect(
      getServerFnErrorCode(
        new Error(JSON.stringify({ error: "bracket_progression_failed" })),
      ),
    ).toBe("bracket_progression_failed");
    expect(getServerFnErrorCode(new Error("bracket_progression_failed"))).toBeNull();
    expect(getServerFnErrorCode({ error: "bracket_progression_failed" })).toBe(
      "bracket_progression_failed",
    );
  });
});
