# ADR-0002 — As-Built Rules & Deviations from Spec v0.1

- **Status:** Accepted
- **Date:** 2026-06-13
- **Supersedes:** none (amends ADR-0001 §10 "Spec gaps")
- **Spec:** `spec/SPEC-CHOWKA-BHARA-ONLINE.md` (v0.1) — now stale w.r.t. the items below
- **Authority note:** The spec is the requirements authority, but it has drifted from the
  shipped game as rules were corrected against a physical reference board. Until the spec
  is amended, **this ADR is the normative record of the rules the engine actually
  enforces.** The in-app `RulesPanel` and `README` reflect these same rules. Code carries
  short `#N` tags for the player-facing rule corrections; they are decoded here so the
  knowledge is not tribal.

---

## 1. Why this ADR exists

Several rules were corrected after v0.1 was written, to match a hand-made reference board
the owner plays on. The spec was not updated in lockstep (it is git-ignored and treated as
a frozen v0.1 artifact). The review of the codebase flagged this drift as a risk. This ADR
makes the as-built rules explicit and authoritative.

## 2. As-built rules (normative)

### R1 — Safe houses are the 8 ✕ squares (CB1 deviation)

`SAFE_HOUSES` = the 4 board corners `[0,0] [0,6] [6,0] [6,6]` **plus** the 4 inner-ring
corners `[1,1] [1,5] [5,1] [5,5]`. The set is rotation-invariant (same physical squares for
every player). Source of truth: `src/domain/board.ts`.

Start markers and the center crown are **not** in this set (see R4).

### R2 — Safe-house stacking, no hits (`#3`)

Any number of pawns — of any players — may share a safe house, and **no hit occurs** there.
On an **ordinary** house the normal rule holds: an own pawn blocks the move, an opponent on
it is hit and sent home.

- Config: `allowStacking: false` (ordinary houses) **and** `allowSafeHouseStacking: true`
  (the ✕ exception). Both flags now exist so the config matches the engine; previously only
  the misleading `allowStacking: false` was present.
- Enforced in `legal-moves.ts` (`destinationRule`) and `invariants.ts` (I-CB4 relaxed to
  permit >1 occupant only on safe houses).

### R3 — Entry on 1, then any roll; free pawn choice (`#2`)

- The **first** pawn enters only on a roll of **1**, landing one house past the home marker
  (`ENTRY_INDEX = 1`).
- **Once any pawn is on the board**, a home pawn may be brought out on **any** roll value
  (it enters `rollValue` houses from the marker).
- On each turn the player may move **any** of their movable pawns (advance an active pawn or
  bring out a home pawn) — the choice is not forced.
- Enforced in `legal-moves.ts` (`generateCandidates`).

### R4 — Start = home marker (index 0); center = finish (not a safe stacking square)

- Index 0 is the player's **start/home marker** (the ✕ at the middle of their edge). All
  four pawns rest there until they enter; **no active pawn ever rests on index 0**. The UI
  paints not-yet-entered pawns stacked on this marker.
- The center crown `[3,3]` is the **finish** (`FINISH_INDEX = 48`), not a safe stacking
  square. A pawn reaching it exactly is removed from play (finished).
- This matches the reference board's aesthetic and **diverges from the spec's "starts are
  safe houses" model**, which is the deviation called out here.

### R5 — Path route matches the physical board

The canonical `SOUTH_PATH` is a 49-house Hamiltonian spiral, rotated 90°/180°/270° for the
other three sides. Two steps mirror the board's drawn route:

- **Inner-square entry is diagonal:** outer-ring last house `[6,2]` → middle-ring ✕ corner
  `[5,1]` (index 23 → 24). This is the hit-gated step (`OUTER_RING_EXIT_INDEX = 24`): a pawn
  may not cross into the inner rings until the player has made a hit
  (`requireHitBeforeInnerPath`).
- **Crown entry is straight:** `[4,3]` → `[3,3]` (index 47 → 48), a straight step up from
  directly below the crown.

A full house-by-house traversal is covered by `tests/integration/full-game.test.ts`.

### R6 — Flattened cowrie odds (presentation of randomness)

Production rolls are cryptographically random but use a **flattened value distribution**
(1–5 ≈ 18% each, 6 ≈ 7%, 12 ≈ 3%) so throws feel varied rather than bunching on 2–4. Scoring
is unchanged: 0 open → 12 (Bhara), 1–6 → that value (6 = Chowka); 6 and 12 grant a bonus
turn. Source: `flatValueRandomSource` in `src/domain/cowries.ts`. Test/replay envs remain
fully deterministic via `seededRandomSource`.

## 3. Known v0.1 limitations (accepted, not yet addressed)

- **Disconnected current player stalls the game (`#6`).** Per spec v0.1 there is no
  auto-skip or turn timeout, so a disconnected player on turn can block progress until they
  return or resign. Acceptable for friendly rooms; a turn timer is future work.
- **Open Supabase RLS.** The v0.1 row-level-security policy allows any client to read/write
  room rows (friendly-room model). Adversarial play would require signed player tokens and
  server-validated commands.
- **Presence now uses CAS** (revision-guarded, with bounded retry) so two tabs no longer
  clobber each other's status; command submission likewise retries on a stale revision. Other
  multi-tab edge cases (e.g. simultaneous reconnects) remain best-effort.

## 4. Consequences

- The engine, in-app rules, and README are the live source of truth for rules; this ADR
  records the rationale and the `#N` tag decode.
- When the spec is next revised, fold R1–R6 into it and mark this ADR `Superseded`.
