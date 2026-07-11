/**
 * RLS + RPC guards for /build-clubero (HARDENED for public diffusion).
 * - Tables restent deny-all pour anon/authenticated.
 * - Les 3 RPC ne sont PLUS exécutables par anon (EXECUTE révoqué) : seul le
 *   Worker (service_role) peut les appeler.
 * - save refusé après complete, plafond MAX_ANSWERS_PER_RESPONSE=100 respecté.
 * - complete idempotent (2 appels → 1 contact).
 * - admin_build_clubero_dashboard rejette non-superadmin.
 */
import { describe, it, expect } from "vitest";
import { anonClient } from "./_clients";
import { admin } from "./_admin";
import { expectInsertBlocked } from "./_helpers";

const rand = () => `bc-test-${Math.random().toString(36).slice(2, 10)}`;

describe("RLS: build_clubero (public feedback — hardened)", () => {
  it("anon cannot SELECT build_clubero_responses", async () => {
    const c = anonClient();
    const { data, error } = await (
      c.from("build_clubero_responses" as any).select("id") as any
    ).limit(1);
    if (!error) expect(data ?? []).toHaveLength(0);
  });

  it("anon cannot SELECT build_clubero_answers", async () => {
    const c = anonClient();
    const { data, error } = await (
      c.from("build_clubero_answers" as any).select("id") as any
    ).limit(1);
    if (!error) expect(data ?? []).toHaveLength(0);
  });

  it("anon INSERT direct is blocked on build_clubero_responses", async () => {
    const c = anonClient();
    await expectInsertBlocked(c, "build_clubero_responses", { session_id: rand() });
  });

  it("anon CANNOT execute start_build_clubero_response (EXECUTE revoked)", async () => {
    const c = anonClient();
    const { error } = await (c.rpc as any)("start_build_clubero_response", {
      p_session_id: rand(),
      p_locale: "fr",
      p_utm: null,
      p_device: "mobile",
    });
    expect(error, "anon must not be able to call the RPC directly").toBeTruthy();
  });

  it("anon CANNOT execute save_build_clubero_answer (EXECUTE revoked)", async () => {
    const c = anonClient();
    const { error } = await (c.rpc as any)("save_build_clubero_answer", {
      p_session_id: rand(),
      p_question_key: "audience",
      p_question_type: "single",
      p_value: "kids",
    });
    expect(error).toBeTruthy();
  });

  it("anon CANNOT execute complete_build_clubero_response (EXECUTE revoked)", async () => {
    const c = anonClient();
    const { error } = await (c.rpc as any)("complete_build_clubero_response", {
      p_session_id: rand(),
      p_contact: null,
    });
    expect(error).toBeTruthy();
  });

  it("full autosave + complete flow via service_role (Worker path)", async () => {
    const sessionId = rand();

    const start = await (admin.rpc as any)("start_build_clubero_response", {
      p_session_id: sessionId,
      p_locale: "fr",
      p_utm: null,
      p_device: "mobile",
    });
    expect(start.error, start.error?.message).toBeNull();
    expect(typeof start.data).toBe("string");

    const save = await (admin.rpc as any)("save_build_clubero_answer", {
      p_session_id: sessionId,
      p_question_key: "audience",
      p_question_type: "single",
      p_value: "kids",
    });
    expect(save.error, save.error?.message).toBeNull();

    const complete = await (admin.rpc as any)("complete_build_clubero_response", {
      p_session_id: sessionId,
      p_contact: { first_name: "Test", email: "t@x.io", newsletter: true, beta: true },
    });
    expect(complete.error, complete.error?.message).toBeNull();

    const { data: rows } = await admin
      .from("build_clubero_responses" as any)
      .select("newsletter_opt_in,newsletter_consent_at,beta_opt_in,beta_consent_at,status")
      .eq("session_id", sessionId)
      .single();
    const r = rows as any;
    expect(r.status).toBe("completed");
    expect(r.newsletter_opt_in).toBe(true);
    expect(r.beta_opt_in).toBe(true);
    expect(r.newsletter_consent_at).toBeTruthy();
    expect(r.beta_consent_at).toBeTruthy();

    await admin
      .from("build_clubero_responses" as any)
      .delete()
      .eq("session_id", sessionId);
  });

  it("save is REFUSED after complete (response_completed)", async () => {
    const sessionId = rand();
    await (admin.rpc as any)("start_build_clubero_response", {
      p_session_id: sessionId,
      p_locale: "fr",
      p_utm: null,
      p_device: "mobile",
    });
    await (admin.rpc as any)("complete_build_clubero_response", {
      p_session_id: sessionId,
      p_contact: null,
    });
    const { error } = await (admin.rpc as any)("save_build_clubero_answer", {
      p_session_id: sessionId,
      p_question_key: "audience",
      p_question_type: "single",
      p_value: "kids",
    });
    expect(error).toBeTruthy();
    expect(String(error?.message ?? "")).toMatch(/response_completed/);
    await admin
      .from("build_clubero_responses" as any)
      .delete()
      .eq("session_id", sessionId);
  });

  it("complete is idempotent (2 calls → 1 contact)", async () => {
    const sessionId = rand();
    await (admin.rpc as any)("start_build_clubero_response", {
      p_session_id: sessionId,
      p_locale: "fr",
      p_utm: null,
      p_device: "mobile",
    });
    const c1 = await (admin.rpc as any)("complete_build_clubero_response", {
      p_session_id: sessionId,
      p_contact: { first_name: "A", email: "a@x.io", newsletter: true, beta: false },
    });
    expect(c1.error).toBeNull();

    const { data: firstRow } = await admin
      .from("build_clubero_responses" as any)
      .select("first_name,email,completed_at")
      .eq("session_id", sessionId)
      .single();
    const firstCompletedAt = (firstRow as any).completed_at;

    // 2e appel avec un contact différent : doit être ignoré
    const c2 = await (admin.rpc as any)("complete_build_clubero_response", {
      p_session_id: sessionId,
      p_contact: { first_name: "B", email: "b@x.io", newsletter: false, beta: true },
    });
    expect(c2.error).toBeNull();

    const { data: secondRow } = await admin
      .from("build_clubero_responses" as any)
      .select("first_name,email,newsletter_opt_in,beta_opt_in,completed_at")
      .eq("session_id", sessionId)
      .single();
    const r = secondRow as any;
    expect(r.first_name).toBe("A");
    expect(r.email).toBe("a@x.io");
    expect(r.newsletter_opt_in).toBe(true);
    expect(r.beta_opt_in).toBe(false);
    expect(r.completed_at).toBe(firstCompletedAt);

    await admin
      .from("build_clubero_responses" as any)
      .delete()
      .eq("session_id", sessionId);
  });

  it("MAX_ANSWERS_PER_RESPONSE=100 : refuse au-delà de 100 clés distinctes", async () => {
    const sessionId = rand();
    await (admin.rpc as any)("start_build_clubero_response", {
      p_session_id: sessionId,
      p_locale: "fr",
      p_utm: null,
      p_device: "mobile",
    });
    // Insère 100 clés distinctes (accepté), puis la 101e (refusée).
    for (let i = 0; i < 100; i++) {
      const { error } = await (admin.rpc as any)("save_build_clubero_answer", {
        p_session_id: sessionId,
        p_question_key: `k_${i}`,
        p_question_type: "text",
        p_value: `v${i}`,
      });
      expect(error, `insert #${i} should succeed`).toBeNull();
    }
    const { error: over } = await (admin.rpc as any)("save_build_clubero_answer", {
      p_session_id: sessionId,
      p_question_key: "k_over",
      p_question_type: "text",
      p_value: "boom",
    });
    expect(over).toBeTruthy();
    expect(String(over?.message ?? "")).toMatch(/answers_limit_exceeded/);

    // Upsert sur clé existante reste autorisé même à saturation.
    const { error: upsert } = await (admin.rpc as any)("save_build_clubero_answer", {
      p_session_id: sessionId,
      p_question_key: "k_0",
      p_question_type: "text",
      p_value: "updated",
    });
    expect(upsert).toBeNull();

    await admin
      .from("build_clubero_responses" as any)
      .delete()
      .eq("session_id", sessionId);
  }, 30_000);

  it("admin_build_clubero_dashboard rejects non-superadmin (anon)", async () => {
    const c = anonClient();
    const { error } = await (c.rpc as any)("admin_build_clubero_dashboard");
    expect(error).toBeTruthy();
    expect(String(error?.message ?? "")).toMatch(/forbidden/i);
  });
});
