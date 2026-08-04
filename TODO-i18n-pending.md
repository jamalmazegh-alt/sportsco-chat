# Pending translations

## Status (2026-08-04)

Bulk native pass applied for DE / ES / IT / NL / PT across all 9 namespaces
(`common`, `needs`, `publications`, `camps`, `challenges`, `tournaments`,
`marketing`, `support`, `buildClubero`).

EN-clone occurrences (string equal to EN while FR differs) went from **~2845 → ~361**.
Remaining matches are mostly intentional cognates / shared UI tokens
(`Team`, `Status`, `Email`, `Beta`, `Live`, `optional`, `Volleyball`, brand titles
like `Publications`, placeholder-only strings).

## Challenge templates — skipped (require value-system extension)

The following templates from the sport catalogue are **still not
implemented** because their result type has no safe mapping onto the current
`challenge_unit` enum (`count`, `time_seconds`, `distance_meters`, `stage`,
`score`) and aggregate system. Per the task rule "do not fake it", they will
land in a follow-up alongside the required extensions.

| Template            | Sport    | Missing capability                                 |
| ------------------- | -------- | -------------------------------------------------- |
| `verticalJump`      | generic  | new unit `height_cm`                               |
| `shotSpeed`         | football | new unit `speed_kmh`                               |
| `handballShotSpeed` | handball | new unit `speed_kmh`                               |
| `tackleTechnique`   | rugby    | new unit `rating_out_of_10` + staff-rated entry UI |
| `firstServeIn`      | tennis   | new unit `percentage`                              |

Adding these requires: extending the `challenge_unit` Postgres enum, the
matching Zod enum in `src/lib/challenges/challenges.functions.ts`, the
`derived_value` trigger, the entry-form input widget per unit (km/h, %, /10),
unit labels in the 7 locales, and appropriate aggregate/direction defaults.
Physical-test staff-only visibility (MIN-11 / JOU-07) still applies to any
newly-added staff-rated template.

Once the value-system extension lands, register the template in
`src/lib/challenges/templates.ts` with the correct `sport` scope and remove
the corresponding row from this file.

## QA note

Native EU strings were produced via bulk localization patches (not
human-linguist QA). A focused linguistic review of high-traffic surfaces
(needs, publications, camps, tournaments, auth/onboarding in `common`) is
still recommended before considering the EU pack “locked”.
