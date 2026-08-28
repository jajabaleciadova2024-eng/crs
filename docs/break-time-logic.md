# Break-time logic — pending build

Captured from the Team Leader's handwritten floor notes plus follow-up
decisions. **Nothing here is implemented yet** beyond the windows themselves.

## Already built

- `workstation_windows` (migration 0027) — each station owns physically
  numbered windows. Managed on `/workstations`.

| Station | Windows |
|---|---|
| Screener | 27, 28, 29 |
| Collecting Officer | 10, 11, 12, 13 |
| Premium Annotation | 8, 9 |
| PACD | 15 |
| Releasing Officer | 18, 20, 21, 23 |
| Electronic Endorsement | 30 |

`workstations.headcount` still drives schedule generation. Windows are
recorded but nothing reads them yet.

## To build

### 1. Break slots per window

Three staggered slots so a station is never fully unmanned:

| | 10 AM | 11 AM | 12 PM |
|---|---|---|---|
| Collecting Officer | W13, W10 | W11 | W12 |
| Premium Annotation | — | W8 | W9 |
| PACD | W15 *(relieved by W18)* | — | — |
| Releasing Officer | W20 | W18, W21 | W23 |
| Electronic Endorsement | anytime | | |

Screener (27/28/29) was struck through on the source note — treated as
excluded from the fixed rotation, but **unconfirmed**.

### 2. Electronic Endorsement is the floating reliever

W30 is not a fixed post — it relieves **any** workstation, and the system
decides which. This is the piece that makes break generation a solver rather
than a lookup: PACD has a single window, so when W15 breaks it must be
covered by someone, and the note shows W18 doing it before taking its own
break at 11 AM. Relief chains have to be computed, not hardcoded.

### 3. Break immunity

Same concept as the existing rotation immunity (`profiles.is_immune`, see
Rotation Settings): some people or windows must be excluded from break
shuffling and pinned. Needs its own flag — rotation immunity and break
immunity are different concerns and shouldn't share a column.

### 4. Generated together with the weekly schedule

Break times are generated in the same action as the weekly schedule and stay
in lockstep — never one without the other. Implications:

- `/api/schedule/generate` produces both, in one transaction
- clearing or regenerating a week clears/regenerates its breaks too
- the audit trail (migration 0026) should cover break assignments as well,
  for the same incident-tracing reason

### 5. Manning priority

When short-staffed, fill in this order: **① Collecting Officer → ② PACD →
③ Releasing Officer**. Applies to manning, and presumably to which station
keeps its reliever when cover is scarce.

## Open questions

1. **Screener** — deliberately excluded from breaks, or was that plan
   scrapped and still undecided?
2. **Break length** — 15 min, 30 min, an hour? Not on the note.
3. **Fixed to the window or the person?** Does W12 always break at 12 PM
   whoever is seated there, or does the slot follow the individual? Decides
   whether slots are static config or generated weekly.
4. **Coffee or lunch?** Three slots across 10 AM–12 PM reads like staggered
   lunch, but 10 AM is early for it.
5. **Relief pairing** — is W18 → W15 permanent, or does the solver pick
   whoever is free?
6. **Does assignment move onto windows entirely**, or do windows stay a layer
   on top of station-level rotation?
