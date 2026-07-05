# Challenge templates — pending translations & skipped templates

## Pending DE/ES/IT/NL/PT translations

The following challenge template keys were added under `templates` in each
of `src/locales/{de,es,it,nl,pt}/challenges.json` with the **English** copy
as a structural placeholder only, to keep `scripts/check-i18n-parity.mjs`
green. They are **not final translations** — they must be replaced through
the same master → QA workflow used for the rest of the app.

Keys awaiting real translation in DE / ES / IT / NL / PT:

- `templates.plankHold`
- `templates.shuttleRun`
- `templates.slalomBall`
- `templates.freeThrows`
- `templates.threePointShots`
- `templates.dribbleCourse`
- `templates.layupSeries`
- `templates.handballDribbleSlalom`
- `templates.sprint40m`
- `templates.agilityRunRugby`
- `templates.successfulPasses`
- `templates.rallyConsistency`
- `templates.movementSpeed`

FR and EN already contain the reviewed, locked wording from the product prompt.

## Skipped templates (require value-system extension)

The following templates from the sport catalogue were **intentionally not
implemented** because their result type has no safe mapping onto the current
`challenge_unit` enum (`count`, `time_seconds`, `distance_meters`, `stage`)
and aggregate system. Per the task rule "do not fake it", they will land in
a follow-up alongside the required extensions.

| Template | Sport | Missing capability |
|---|---|---|
| `verticalJump` | generic | new unit `height_cm` |
| `shotAccuracy` | football | new unit `score` (points on target zones) |
| `shotSpeed` | football | new unit `speed_kmh` |
| `handballShotSpeed` | handball | new unit `speed_kmh` |
| `handballShotAccuracy` | handball | new unit `score` |
| `passingAccuracy` | handball | new unit `score` |
| `rugbyPassingAccuracy` | rugby | new unit `score` |
| `tackleTechnique` | rugby | new unit `rating_out_of_10` + staff-rated entry UI |
| `pushPower` | rugby | new unit `score` |
| `serveAccuracy` | volleyball | new unit `score` |
| `receptionControl` | volleyball | new unit `score` + staff-rated entry UI |
| `attackAccuracy` | volleyball | new unit `score` |
| `tennisServeAccuracy` | tennis | new unit `score` |
| `targetShots` | tennis | new unit `score` |
| `firstServeIn` | tennis | new unit `percentage` |

Adding these requires: extending the `challenge_unit` Postgres enum, the
matching Zod enum in `src/lib/challenges/challenges.functions.ts`, the
`derived_value` trigger, the entry-form input widget per unit (steppers,
km/h, %, /10), unit labels in the 7 locales, and appropriate aggregate/
direction defaults (all `record` except `*Accuracy`/`*Passes` which stay
`cumulative`). Physical-test staff-only visibility (MIN-11 / JOU-07) still
applies to any newly-added staff-rated template.

Once the value-system extension lands, register the template in
`src/lib/challenges/templates.ts` with the correct `sport` scope and remove
the corresponding row from this file.
