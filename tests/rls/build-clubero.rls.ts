/**
 * RLS + RPC guards for /build-clubero.
 * - Tables are deny-all: anon and authenticated cannot SELECT/INSERT directly.
 * - The 3 public RPC (start/save/complete) must be callable by anon.
 * - `admin_build_clubero_dashboard` must reject non-superadmins with 42501.
 */
import { describe, it, expect } from "vitest";
import { anonClient } from "./_clients";
import { admin } from "./_admin";
import { expectInsertBlocked } from "./_helpers";

const rand = () => `bc-test-${Math.random().toString(36).slice(2, 10)}`;

describe("RLS: build_clubero (public feedback)", () => {
  it("anon cannot SELECT build_clubero_responses", async () => {
    const c = anonClient();
    const { data, error } = await (c.from("build_clubero_responses" as any).select("id") as any).limit(1);
    // deny-all: either an error or an empty result.
    if (!error) expect(data ?? []).toHaveLength(0);
  });

  it("anon cannot SELECT build_clubero_answers", async () => {
    const c = anonClient();
    const { data, error } = await (c.from("build_clubero_answers" as any).select("id") as any).limit(1);
    if (!error) expect(data ?? []).toHaveLength(0);
  });

  it("anon INSERT direct is blocked on build_clubero_responses", async () => {
    const c = anonClient();
    await expectInsertBlocked(c, "build_clubero_responses", { session_id: rand() });
  });

  it("full autosave + complete flow via RPC as anon", async () => {
    const c = anonClient();
    const sessionId = rand();

    const start = await (c.rpc as any)("start_build_clubero_response", {
      p_session_id: sessionId,
      p_locale: "fr",
      p_utm: null,
      p_device: "mobile",
    });
    expect(start.error, start.error?.message).toBeNull();
    expect(typeof start.data).toBe("string");

    const save = await (c.rpc as any)("save_build_clubero_answer", {
      p_session_id: sessionId,
      p_question_key: "audience",
      p_question_type: "single",
      p_value: "kids",
    });
    expect(save.error, save.error?.message).toBeNull();

    const complete = await (c.rpc as any)("complete_build_clubero_response", {
      p_session_id: sessionId,
      p_contact: { first_name: "Test", email: "t@x.io", newsletter: true, beta: true },
    });
    expect(complete.error, complete.error?.message).toBeNull();

    // Verify via service_role that consents are timestamped separately.
    const { data: rows, error } = await admin
      .from("build_clubero_responses" as any)
      .select("newsletter_opt_in,newsletter_consent_at,beta_opt_in,beta_consent_at,status")
      .eq("session_id", sessionId)
      .single();
    expect(error).toBeNull();
    expect(rows).toBeTruthy();
    const r = rows as any;
    expect(r.status).toBe("completed");
    expect(r.newsletter_opt_in).toBe(true);
    expect(r.beta_opt_in).toBe(true);
    expect(r.newsletter_consent_at).toBeTruthy();
    expect(r.beta_consent_at).toBeTruthy();

    // Cleanup
    await admin.from("build_clubero_responses" as any).delete().eq("session_id", sessionId);
  });

  it("admin_build_clubero_dashboard rejects non-superadmin (anon)", async () => {
    const c = anonClient();
    const { error } = await (c.rpc as any)("admin_build_clubero_dashboard");
    expect(error).toBeTruthy();
    // Postgres 42501 = insufficient_privilege
    expect(String(error?.message ?? "")).toMatch(/forbidden/i);
  });
});
