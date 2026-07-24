/**
 * Regression test: every server function in src/lib/superadmin/observability.functions.ts
 * MUST call assertSuperAdmin(context.userId) before touching any data.
 *
 * A missing guard on any of these six handlers is a data leak (players/parents/roster
 * of minors), so we assert both by static inspection AND by invoking each handler with
 * a stub context whose assertSuperAdmin rejects.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const forbidden = vi.hoisted(() => vi.fn(async () => {
  const err = new Error("Forbidden") as Error & { status: number };
  err.status = 403;
  throw err;
}));


vi.mock("@/lib/authz.server", () => ({ assertSuperAdmin: forbidden }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {
    // Passthrough middleware stub — the createServerFn builder just needs
    // something that behaves like a middleware object.
    _tag: "middleware",
  },
}));

const FILE = fileURLToPath(new URL("../../lib/superadmin/observability.functions.ts", import.meta.url));

describe("superadmin observability: static guard presence", () => {
  const src = readFileSync(FILE, "utf8");
  const handlers = [
    "listInviteBatches",
    "getInviteBatchRows",
    "listNotificationEmails",
    "listNotificationPush",
    "getClubRoster",
    "getPlayerAudit",
  ];

  it("imports assertSuperAdmin", () => {
    expect(src).toMatch(/assertSuperAdmin/);
  });

  it("has exactly one guard per handler (6 total)", () => {
    const count = (src.match(/await assertSuperAdmin\(context\.userId\)/g) ?? []).length;
    expect(count).toBe(handlers.length);
  });

  for (const name of handlers) {
    it(`${name} contains the guard before any rpc call`, () => {
      const start = src.indexOf(`export const ${name} `);
      expect(start).toBeGreaterThan(-1);
      const end = src.indexOf("export const ", start + 1);
      const block = src.slice(start, end === -1 ? undefined : end);
      const guardIdx = block.indexOf("await assertSuperAdmin(context.userId)");
      const rpcIdx = block.indexOf(".rpc(");
      expect(guardIdx).toBeGreaterThan(-1);
      expect(rpcIdx).toBeGreaterThan(-1);
      expect(guardIdx).toBeLessThan(rpcIdx);
    });
  }
});

describe("superadmin observability: guard is invoked and rejects non-super", () => {
  beforeEach(() => forbidden.mockClear());

  it("invokes assertSuperAdmin before any RPC on each handler", async () => {
    const mod = await import("@/lib/superadmin/observability.functions");
    const calls: Array<[string, () => Promise<unknown>]> = [
      ["listInviteBatches", () => mod.listInviteBatches({ data: {} } as never)],
      ["getInviteBatchRows", () => mod.getInviteBatchRows({ data: { batchId: "x" } } as never)],
      ["listNotificationEmails", () => mod.listNotificationEmails({ data: {} } as never)],
      ["listNotificationPush", () => mod.listNotificationPush({ data: {} } as never)],
      ["getClubRoster", () =>
        mod.getClubRoster({ data: { clubId: "00000000-0000-0000-0000-000000000000" } } as never)],
      ["getPlayerAudit", () =>
        mod.getPlayerAudit({ data: { playerId: "00000000-0000-0000-0000-000000000000" } } as never)],
    ];
    for (const [, run] of calls) {
      await run().catch(() => undefined);
    }
    // Every handler must have called the guard (mocked to reject); if a handler
    // ever bypasses the guard this count drops and the leak is caught.
    expect(forbidden).toHaveBeenCalledTimes(calls.length);
  });

});
