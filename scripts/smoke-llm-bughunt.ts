/**
 * Smoke-test couche LLM sur bughunt (sans UI Playwright).
 *
 * Prérequis :
 *   - Migration LLM appliquée (apply-llm-migration-bughunt.ts)
 *   - .env.qa avec SUPABASE_* bughunt + LOVABLE_API_KEY (optionnel pour test fallback)
 *
 * Usage :
 *   node --env-file=.env.qa ./node_modules/tsx/dist/cli.mjs scripts/smoke-llm-bughunt.ts
 */
import { createClient } from "@supabase/supabase-js";
import { recommendFormat } from "../src/modules/tournaments/lib/planner";
import { callLLM, anonymizePlayers } from "../src/lib/llm/core.server";
import { z } from "zod";

const BUGHUNT = "dkcfcifsrnnaqaipfuzi";
const PROD = "woawmhuntajpiezmmgzm";

function refOf(url: string): string {
  try {
    return new URL(url).host.split(".")[0];
  } catch {
    return "";
  }
}

function assertBughunt(url: string): void {
  const ref = refOf(url);
  if (ref === PROD) throw new Error("ABORT: cible PROD");
  if (ref !== BUGHUNT) throw new Error(`ABORT: ref ${ref} != ${BUGHUNT}`);
}

async function checkTables(url: string, key: string): Promise<boolean> {
  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (const table of ["llm_usage", "llm_cache"] as const) {
    const { error } = await db.from(table).select("id").limit(1);
    if (error) {
      console.log(`✗ table ${table}: ${error.message}`);
      return false;
    }
    console.log(`✓ table ${table} accessible`);
  }
  return true;
}

async function main() {
  const url = process.env.SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  assertBughunt(url);
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant");

  const results: Record<string, "ok" | "ko" | "skip"> = {};

  // 1. Tables
  results.tables = (await checkTables(url, serviceKey)) ? "ok" : "ko";
  if (results.tables === "ko") {
    console.log("\n❌ Tables LLM absentes — lance apply-llm-migration-bughunt.ts d'abord.");
    process.exit(1);
  }

  // 2. Fallback déterministe (planner pur, sans LLM)
  const reco = recommendFormat({
    teams: 16,
    allDay: true,
    multipleTrophies: true,
    paid: false,
  });
  if (reco.pools > 0 && reco.totalMatches > 0) {
    console.log("✓ recommendFormat déterministe OK");
    results.deterministic = "ok";
  } else {
    console.log("✗ recommendFormat KO");
    results.deterministic = "ko";
  }

  // 3. Fallback callLLM sans clé
  const savedKey = process.env.LOVABLE_API_KEY;
  delete process.env.LOVABLE_API_KEY;
  const noKey = await callLLM({
    feature: "tournament_reco",
    userId: null,
    system: "test",
    prompt: "test",
    schema: z.object({ explanation: z.string() }),
    jsonResponse: true,
  });
  if (!noKey.ok) {
    console.log("✓ callLLM sans LOVABLE_API_KEY → { ok: false } (fallback silencieux)");
    results.fallback_no_key = "ok";
  } else {
    console.log("✗ callLLM sans clé a réussi (inattendu)");
    results.fallback_no_key = "ko";
  }
  if (savedKey) process.env.LOVABLE_API_KEY = savedKey;

  // 4. Privacy helpers
  const { map } = anonymizePlayers(["alice@x.com", "Jean Dupont"]);
  const leaked = [...map.values()].some((v) => v.includes("@") || v.includes("Jean"));
  if (!leaked) {
    console.log("✓ anonymizePlayers ne fuite pas noms/emails");
    results.privacy = "ok";
  } else {
    console.log("✗ anonymizePlayers fuite des PII");
    results.privacy = "ko";
  }

  // 5. Appel LLM réel (si clé présente)
  if (!process.env.LOVABLE_API_KEY) {
    console.log("⚠ LOVABLE_API_KEY absente — skip appel LLM réel");
    results.llm_live = "skip";
  } else {
    const live = await callLLM({
      feature: "tournament_reco",
      userId: null,
      system:
        'Réponds JSON strict: {"explanation":"Format poules adapté pour 16 équipes sur une journée."}',
      prompt: JSON.stringify({
        pools: reco.pools,
        perPool: reco.perPool,
        totalMatches: reco.totalMatches,
        format: reco.format,
      }),
      schema: z.object({ explanation: z.string().min(10) }),
      jsonResponse: true,
      timeoutMs: 5000,
    });
    if (live.ok) {
      console.log("✓ appel LLM live OK:", live.data.explanation.slice(0, 80) + "…");
      results.llm_live = "ok";

      // Vérif logging llm_usage
      const db = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: rows } = await db
        .from("llm_usage")
        .select("feature, status")
        .eq("feature", "tournament_reco")
        .order("created_at", { ascending: false })
        .limit(1);
      if (rows?.length) {
        console.log(`✓ llm_usage loggé (status=${rows[0].status})`);
        results.logging = "ok";
      } else {
        console.log("⚠ llm_usage vide après appel (logging best-effort)");
        results.logging = "ko";
      }
    } else {
      console.log("✗ appel LLM live KO (clé invalide, timeout, ou gateway down)");
      results.llm_live = "ko";
    }
  }

  console.log("\n--- Résumé ---");
  console.log(JSON.stringify(results, null, 2));

  const hardFail = Object.entries(results).some(
    ([k, v]) => v === "ko" && k !== "llm_live" && k !== "logging",
  );
  process.exit(hardFail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
