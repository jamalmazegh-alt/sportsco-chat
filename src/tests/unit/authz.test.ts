/**
 * Unit tests for the centralized authorization guards.
 *
 * `supabaseAdmin` and the request-scoped `context.supabase` are both mocked
 * so the tests run in isolation (no network, no DB). We assert that each
 * guard throws a `Response` with the expected HTTP status when the caller
 * is not authorized, and returns normally when it is.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- supabaseAdmin mock (must be hoisted before importing authz) ----
const { superAdminMaybeSingle, rpcMock } = vi.hoisted(() => ({
  superAdminMaybeSingle: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => {
  const from = (table: string) => {
    if (table !== "super_admins") {
      throw new Error(`unexpected admin .from(${table})`);
    }
    return {
      select: () => ({
        eq: () => ({ maybeSingle: superAdminMaybeSingle }),
      }),
    };
  };
  return {
    supabaseAdmin: { from, rpc: rpcMock },
  };
});


import { assertSuperAdmin, assertClubRole } from "@/lib/authz.server";

// ---------- minimal SupabaseClient fake for context.supabase --------------
function makeCtxClient(memberRow: { roles?: string[] | null; role?: string | null } | null) {
  return {
    from: (table: string) => {
      if (table !== "club_members") throw new Error(`unexpected ctx .from(${table})`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: memberRow, error: null }),
            }),
          }),
        }),
      };
    },
  } as any;
}

async function expectForbidden(p: Promise<unknown>) {
  await expect(p).rejects.toMatchObject({ status: 403 });
}

beforeEach(() => {
  superAdminMaybeSingle.mockReset();
  rpcMock.mockReset();
});

// =========================================================================
describe("assertSuperAdmin", () => {
  it("allows a registered super admin", async () => {
    superAdminMaybeSingle.mockResolvedValueOnce({ data: { user_id: "u-super" }, error: null });
    await expect(assertSuperAdmin("u-super")).resolves.toBeUndefined();
  });

  it("rejects a club admin (non-super) with 403", async () => {
    superAdminMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expectForbidden(assertSuperAdmin("u-club-admin"));
  });

  it("rejects a normal user/player with 403", async () => {
    superAdminMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expectForbidden(assertSuperAdmin("u-player"));
  });
});

// =========================================================================
describe("assertClubRole", () => {
  it("allows admin of club A when checking club A / ['admin']", async () => {
    superAdminMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const supabase = makeCtxClient({ roles: ["admin"], role: null });
    await expect(
      assertClubRole({ supabase, userId: "u-admin-a", clubId: "club-A", allowedRoles: ["admin"] }),
    ).resolves.toBeUndefined();
  });

  it("rejects admin of club A when checking club B (cross-tenant)", async () => {
    superAdminMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // No membership row in club B for this user.
    const supabase = makeCtxClient(null);
    await expectForbidden(
      assertClubRole({ supabase, userId: "u-admin-a", clubId: "club-B", allowedRoles: ["admin"] }),
    );
  });

  it("rejects a normal player when admin role is required", async () => {
    superAdminMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const supabase = makeCtxClient({ roles: ["player"], role: "player" });
    await expectForbidden(
      assertClubRole({ supabase, userId: "u-player", clubId: "club-A", allowedRoles: ["admin"] }),
    );
  });

  it("allows a superadmin on any club (shortcut, no member row needed)", async () => {
    superAdminMaybeSingle.mockResolvedValueOnce({ data: { user_id: "u-super" }, error: null });
    // ctx.supabase should not even be queried — pass a client that would throw if used.
    const supabase = {
      from: () => {
        throw new Error("super admin shortcut should skip club_members lookup");
      },
    } as any;
    await expect(
      assertClubRole({ supabase, userId: "u-super", clubId: "club-Z", allowedRoles: ["admin"] }),
    ).resolves.toBeUndefined();
  });

  it("financial_admin: allowed when RPC fallback returns true", async () => {
    superAdminMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const supabase = makeCtxClient({ roles: [], role: null });
    rpcMock.mockResolvedValueOnce({ data: true, error: null });
    await expect(
      assertClubRole({
        supabase,
        userId: "u-fin",
        clubId: "club-A",
        allowedRoles: ["financial_admin"],
      }),
    ).resolves.toBeUndefined();
    expect(rpcMock).toHaveBeenCalledWith("has_club_role_text", {
      _user_id: "u-fin",
      _club_id: "club-A",
      _role: "financial_admin",
    });
  });

  it("financial_admin: forbidden when RPC fallback denies", async () => {
    superAdminMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const supabase = makeCtxClient({ roles: [], role: null });
    rpcMock.mockResolvedValueOnce({ data: false, error: null });
    await expectForbidden(
      assertClubRole({
        supabase,
        userId: "u-noone",
        clubId: "club-A",
        allowedRoles: ["financial_admin"],
      }),
    );
  });

  it("rejects with 403 when clubId is empty", async () => {
    const supabase = makeCtxClient(null);
    await expectForbidden(
      assertClubRole({ supabase, userId: "u-any", clubId: "", allowedRoles: ["admin"] }),
    );
  });
});
