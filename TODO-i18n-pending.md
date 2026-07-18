# Pending translations

## `needs.json` — Phase B UI extension (DE/ES/IT/NL/PT)

The Phase B UI for "Coups de main" added ~30 UI keys under `needs.json`:
`section.*` (title, add, emptyStaff, created, createDesc, coverageAll,
coverageMissing_one, coverageMissing_other), `field.*` (template, label,
capacity, mode, description), `publish.*` (title, desc, audienceHeader,
chooseGroup, chooseTeam, chooseCategory, categoryPlaceholder, preview_one,
preview_other, previewNone, previewLoading, success, successIdempotent),
`publishedBadge.*` (at_one, at_other, unpublished), `audiences.*`
(club_group, team_players, team_parents, team_educators, category_educators
+ the 7 existing scalars), `staff.*` (title, empty, minorPending, license),
`pendingApplications_one`, `pendingApplications_other`, `confirmCancel`.

FR and EN are reviewed and final. DE/ES/IT/NL/PT are **clones of EN** for
parity — they must be replaced by native translations. Also `seats.remaining`
was migrated to i18next v4 plural convention (`remaining_one` /
`remaining_other`) — the 5 non-FR/EN locales inherited the EN plural fallback
and need native review too.





# Challenge templates — pending translations & skipped templates

## Pending DE/ES/IT/NL/PT translations

The following challenge template keys were added under `templates` in each
of `src/locales/{de,es,it,nl,pt}/challenges.json` with the **English** copy
as a structural placeholder only, to keep `scripts/check-i18n-parity.mjs`
green. They are **not final translations** — they must be replaced through
the same master → QA workflow used for the rest of the app.

Keys awaiting real translation in DE / ES / IT / NL / PT:

- `units.score`
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
- `templates.shotAccuracy`
- `templates.handballShotAccuracy`
- `templates.passingAccuracy`
- `templates.rugbyPassingAccuracy`
- `templates.pushPower`
- `templates.serveAccuracy`
- `templates.receptionControl`
- `templates.attackAccuracy`
- `templates.tennisServeAccuracy`
- `templates.targetShots`

FR and EN already contain the reviewed, locked wording from the product prompt.

## Skipped templates (require value-system extension)

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
