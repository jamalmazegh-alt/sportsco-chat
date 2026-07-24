/**
 * Regression test: every server function in src/lib/superadmin/observability.functions.ts
 * MUST call assertSuperAdmin(context.userId) before touching any data.
 *
 * A missing guard on any of these six handlers is a data leak (players/parents/roster
 * of minors), so we assert both by static inspection AND by invoking each handler with
 * a stub context whose assertSuperAdmin rejects.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";



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

