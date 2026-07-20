#!/usr/bin/env node
/**
 * Guard against dot-namespace i18n calls in publications routes.
 *
 * i18next resolves `t("publications.foo")` against the default namespace
 * (`common`) instead of the `publications` namespace. Use `t("publications:foo")`.
 * This check greps for the anti-pattern and exits non-zero when found.
 */
import { execSync } from "node:child_process";

const NAMESPACES = ["publications"];
let failed = 0;

for (const ns of NAMESPACES) {
  try {
    const out = execSync(
      `rg -n --no-heading 't\\("${ns}\\.' src/ || true`,
      { encoding: "utf8" },
    );
    const hits = out.trim().split("\n").filter(Boolean);
    if (hits.length) {
      failed += hits.length;
      console.error(
        `✗ Found ${hits.length} dot-namespace i18n call(s) for "${ns}" — use "${ns}:" (colon):`,
      );
      for (const h of hits) console.error("  " + h);
    }
  } catch (e) {
    console.error("check failed:", e.message);
    process.exit(2);
  }
}

if (failed > 0) {
  console.error(`\n${failed} bad i18n call(s). Replace "ns." with "ns:".`);
  process.exit(1);
}
console.log("✓ i18n namespace separator OK");
