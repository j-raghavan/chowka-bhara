# ADR-0001 — Chowka Bhara Online: Architecture & Domain API Contract

- **Status:** Accepted
- **Date:** 2026-06-13
- **Branch:** `feat/chowka-bhara-online`
- **Supersedes:** none
- **Spec:** `spec/SPEC-CHOWKA-BHARA-ONLINE.md` (v0.1)
- **Authority note:** The spec is the requirements authority. This ADR is the *engineering authority* for module boundaries and API signatures. Where the two conflict, the conflicts are flagged in §10 (Spec gaps) and the ADR decision is normative for code until the spec is amended.

This ADR folds in 9 lead-verified implementation learnings (L1–L9), treated as normative. They are cited inline as **[L#]**.

---

## 1. Confirmed layer architecture & module boundaries

Ports-and-adapters (hexagonal). Dependencies point **inward only**. The domain is a pure, deterministic core with zero IO.

```
┌──────────────────────────────────────────────────────────────┐
│ UI Layer  (React/Vite)                          [adapter]     │
│ Board · House · Pawn · CowrieRoll · MovePicker · History      │
│ — renders GameState, dispatches GameCommand. No rules here.   │
└───────────────┬──────────────────────────────────────────────┘
                │ depends on
┌───────────────▼──────────────────────────────────────────────┐
│ Application Layer  (src/app)                    [orchestration]│
│ game-service.ts: createRoom/join/start/roll/select/resign     │
│ — owns CowrieRandomSource, Clock, IdSource instances.         │
│ — builds commands, calls transport.transactCommand.           │
│ — NEVER mutates GameState directly; delegates to reducer.     │
└──────┬──────────────────────────────────────┬────────────────┘
       │ depends on                            │ depends on (port)
┌──────▼───────────────────────────────┐ ┌────▼──────────────────┐
│ Domain / Rules Engine (src/domain)    │ │ Transport Port         │
│ PURE. No React/DOM/storage/network.   │ │ GameTransport (iface)  │
│ types · board · paths · cowries ·     │ │  ├ FakeTransport       │
│ legal-moves · reducer · invariants ·  │ │  ├ FirebaseTransport   │
│ history                               │ │  └ SupabaseTransport   │
│ [L1][L4][L5] determinism + invariants │ │ [L6] transaction-first │
└───────────────────────────────────────┘ └───────────────────────┘
```

### Boundary rules (enforced, lint-able)

| Rule | Statement | Source |
|---|---|---|
| B1 | `src/domain/**` imports **nothing** from `react`, `react-dom`, browser globals, storage, or any backend SDK. | I-CB1, **L1** |
| B2 | Only `reducer.ts` produces a new `GameState`. UI/transport/app never re-implement legality. | I-CB2 |
| B3 | Domain receives all nondeterminism via injected ports: `CowrieRandomSource`, `Clock`, `IdSource`. No `Math.random()` / `Date.now()` / `crypto.randomUUID()` inside `src/domain/**`. | **L4** |
| B4 | Constants `innerPathStartIndex` (rename → see §2.4), `finishIndex`, `safeHouses` live **only** in `board.ts`. `GameConfig` references them; nothing else hard-codes them. | **L9** |
| B5 | Transport adapters are interchangeable behind `GameTransport`; the concurrency contract is proven against `FakeTransport`. | D-CB6, **L6** |
| B6 | `assertInvariants(state)` runs at the end of every reducer transition under `NODE_ENV !== 'production'`. | **L5** |

### Test/coverage policy **[L8]**

- `src/domain/**` and `src/app/**` (logic): **≥ 97%** lines/branches (project CLAUDE.md mandate overrides the spec's 95/85).
- `src/components/**`, `src/pages/**` (UI): best-effort, **measured and reported separately**, not gating the 97% number.
- The spec's NFR "rules engine ≥95% / project ≥85%" is **superseded** here (gap G7, §10).

---

## 2. Domain module API signatures (precise TypeScript)

> All domain types are `readonly` / frozen-by-convention. The reducer returns **new** state objects (structural sharing where convenient); it never mutates inputs.

### 2.1 `src/domain/types.ts`

Re-exports the spec's interfaces. Authoritative additions/clarifications below; everything else is exactly as in the spec's *Interfaces* section (`GameConfig`, `Coord`, `PlayerSide`, `RollValue`, `CowrieFace`, `CowrieRoll`, `Pawn`, `Player`, `GameState`, `LegalMove`, `LegalMoveType`, command shapes).

```ts
// --- Branded occupancy key (single source of truth for the key format) [L1] ---
export type CoordKey = string & { readonly __brand: 'CoordKey' }; // "row,col"

// --- Ports for determinism [L4] ---
export interface CowrieRandomSource {
  /** Returns exactly `count` faces. Pure w.r.t. its own internal seed/state. */
  rollFaces(count: number): readonly CowrieFace[];
}
export interface Clock { now(): number; }            // injected timestamps
export interface IdSource { next(): string; }        // injected ids (commandId, pawnId, rollId, eventId)

/** Bundle injected into reducer/service so domain stays pure. */
export interface DomainEnv {
  readonly clock: Clock;
  readonly ids: IdSource;
  readonly random: CowrieRandomSource;
}

// --- Command set (discriminated union over `type`) ---
export type CommandType =
  | 'CREATE_ROOM' | 'JOIN_ROOM' | 'LEAVE_ROOM'
  | 'START_GAME' | 'ROLL' | 'SELECT_MOVE' | 'RESIGN';

export interface BaseCommand {
  readonly commandId: string;        // idempotency key [L4][I-CB16]
  readonly type: CommandType;
  readonly gameId: string;
  readonly playerId: string;
  readonly expectedRevision: number; // CAS guard [L6][I-CB17]
  readonly issuedAt: number;         // from Clock at issue site
}
export interface RollCowriesCommand   extends BaseCommand { readonly type: 'ROLL'; }
export interface SelectMoveCommand    extends BaseCommand { readonly type: 'SELECT_MOVE'; readonly moveId: string; }
export interface StartGameCommand     extends BaseCommand { readonly type: 'START_GAME'; }
export interface ResignCommand        extends BaseCommand { readonly type: 'RESIGN'; }
export interface CreateRoomCommand    extends BaseCommand { readonly type: 'CREATE_ROOM'; readonly displayName: string; }
export interface JoinRoomCommand      extends BaseCommand { readonly type: 'JOIN_ROOM'; readonly displayName: string; readonly reclaimToken?: string; }
export interface LeaveRoomCommand     extends BaseCommand { readonly type: 'LEAVE_ROOM'; }

export type GameCommand =
  | CreateRoomCommand | JoinRoomCommand | LeaveRoomCommand
  | StartGameCommand | RollCowriesCommand | SelectMoveCommand | ResignCommand;

// --- Reducer result envelope ---
export type CommandRejectionCode =
  | 'NOT_CURRENT_PLAYER' | 'WRONG_PHASE' | 'MOVE_NOT_LEGAL'
  | 'CONFIG_LOCKED' | 'NOT_HOST' | 'ROOM_FULL' | 'BAD_PLAYER_COUNT'
  | 'DUPLICATE_COMMAND' | 'STALE_REVISION' | 'GAME_OVER' | 'UNKNOWN_COMMAND';

export interface ApplyResult {
  readonly state: GameState;          // next state (or unchanged on idempotent/rejected)
  readonly accepted: boolean;
  readonly rejection?: CommandRejectionCode;
  readonly events: readonly GameEvent[]; // events emitted by THIS transition
}

// --- Events (history) ---
export type GameEventType =
  | 'JOIN' | 'LEAVE' | 'START' | 'ROLL' | 'MOVE' | 'HIT'
  | 'FINISH' | 'SKIP' | 'BONUS' | 'TURN_ADVANCE' | 'WIN' | 'RESIGN';
export interface GameEvent {
  readonly id: string;
  readonly type: GameEventType;
  readonly playerId: string | null;
  readonly at: number;
  readonly data?: Readonly<Record<string, unknown>>;
}
```

**Phase model (clarification, gap G1).** The spec implies a phase but never names it. We add a derived, *non-stored* notion: a turn is in **`awaiting-roll`** when `currentRoll === null`, and **`awaiting-move`** when `currentRoll !== null && legalMoves.length > 0`. `SELECT_MOVE` is only valid in `awaiting-move`; `ROLL` only in `awaiting-roll`. (No new stored field; derived from existing `GameState`.)

### 2.2 `src/domain/board.ts` — single source of truth **[L9]**

```ts
export type Coord = readonly [row: number, col: number];
export type PlayerSide = 'south' | 'east' | 'north' | 'west';

export const BOARD_SIZE = 7 as const;
export const CENTER: Coord = [3, 3];

export const START_HOUSES: Readonly<Record<PlayerSide, Coord>>;
export const SAFE_HOUSES: readonly Coord[];          // 4 starts + center

// Path index landmarks (renamed — see §2.4) [L7][L9]
export const OUTER_RING_LAST_INDEX = 23 as const;    // last outer-ring cell ([6,2])
export const MIDDLE_RING_START_INDEX = 24 as const;  // RENAME of innerPathStartIndex; entry to 5x5 ring ([5,2])
export const INNER_RING_START_INDEX = 40 as const;   // entry to true 3x3 ring ([4,3])
export const FINISH_INDEX = 48 as const;             // [3,3]

// Rotations
export function rotate90Clockwise(c: Coord): Coord;
export function rotate180(c: Coord): Coord;
export function rotate270Clockwise(c: Coord): Coord;

// Coord <-> key (the ONE occupancy key format) [L1]
export function coordKey(c: Coord): CoordKey;         // `${row},${col}`
export function keyToCoord(k: CoordKey): Coord;
export function inBounds(c: Coord): boolean;
export function isSafe(c: Coord): boolean;            // membership test against SAFE_HOUSES
```

**`MIDDLE_RING_START_INDEX` is the gate constant** for `requireHitBeforeInnerPath`. The spec's name `innerPathStartIndex` is retained *only* as a deprecated alias in `GameConfig` for back-compat of stored games; new code must use `MIDDLE_RING_START_INDEX`. The semantics of "inner path" in the **rule text** (DEV-CB7 / CB3-FR13) = "the path beyond the outer ring", i.e. index ≥ 24. This is what `requireHitBeforeInnerPath` gates. (Gap G2.)

### 2.3 `src/domain/paths.ts`

```ts
export const SOUTH_PATH: readonly Coord[];                       // length 49, verified
export const PATHS: Readonly<Record<PlayerSide, readonly Coord[]>>;

/** Resolve a side+pathIndex to a board Coord. Throws on out-of-range index. */
export function coordAt(side: PlayerSide, pathIndex: number): Coord;

/** Validates all 5 path invariants; used in tests and assertInvariants. */
export function validatePaths(paths?: Readonly<Record<PlayerSide, readonly Coord[]>>): void;
```

**Geometry confirmed (lead L-verified, re-verified here):** `SOUTH_PATH` length 49, unique, in-bounds; idx0=`[6,3]` start, idx23=`[6,2]` (outer last), idx24=`[5,2]` (5x5 middle-ring entry), idx40=`[4,3]` (3x3 inner-ring entry), idx48=`[3,3]` finish. All four rotated paths valid.

### 2.4 The occupancy-map contract **[L1] — the load-bearing contract**

Occupancy is keyed by **resolved board `Coord`**, *never* by `pathIndex`. All four paths physically overlap on the shared perimeter; two pawns at the same `pathIndex` are on different cells, and two at different indices can collide on one cell. Every hit / own-block / safe-block / no-stacking check reads from **one** Coord-keyed map.

```ts
// src/domain/occupancy.ts (helper module; may live inside legal-moves.ts if <500 lines)

export interface Occupant {
  readonly pawnId: string;
  readonly playerId: string;
  readonly side: PlayerSide;
}

/** Key format: `${row},${col}` (CoordKey). Built ONLY from active pawns. */
export type OccupancyMap = ReadonlyMap<CoordKey, Occupant>;

/**
 * Build occupancy from state. Includes ONLY pawns with state === 'active'.
 * Home pawns (no board cell) and finished pawns (not capturable, I-CB6) are EXCLUDED.
 * Invariant: building never yields two active pawns on one key (I-CB4) — assert in dev.
 */
export function buildOccupancy(state: GameState): OccupancyMap;

export function occupantAt(occ: OccupancyMap, c: Coord): Occupant | undefined; // occ.get(coordKey(c))
```

Key format is fixed as `"row,col"` (zero-padded NOT required; rows/cols are single digit 0–6). `coordKey`/`keyToCoord` in `board.ts` are the only producers/consumers.

### 2.5 `src/domain/cowries.ts`

```ts
export function scoreCowries(faces: readonly CowrieFace[]): RollValue;  // spec algorithm; throws if len !== 6
export function grantsBonus(value: RollValue): boolean;                 // true for 6 and 12 [I-CB9]

/** Build a CowrieRoll using injected env (no Math.random/Date.now) [L4]. */
export function rollCowries(env: DomainEnv): CowrieRoll;
// internally: faces = env.random.rollFaces(6); value = scoreCowries(faces);
// id = env.ids.next(); rolledAt = env.clock.now();

/** Deterministic seeded source for tests/replay. */
export function seededRandomSource(seed: readonly CowrieFace[][] | number): CowrieRandomSource;
```

### 2.6 `src/domain/legal-moves.ts` — ordered, individually-testable predicate chain **[L2]**

Generation = produce candidates, then filter through an **ordered** gate chain. Each gate maps 1:1 to an Acceptance Criterion (cited).

```ts
export interface MoveContext {
  readonly state: GameState;
  readonly occ: OccupancyMap;       // built once per generation [L1]
  readonly player: Player;
  readonly roll: CowrieRoll;
}

/** Candidate before gating: a pawn + its prospective toIndex. */
export interface MoveCandidate {
  readonly pawnId: string;
  readonly type: LegalMoveType;     // 'enter' | 'move'
  readonly fromIndex: number | null; // null for 'enter'
  readonly toIndex: number;
  readonly side: PlayerSide;
}

/** Result of a single gate: pass-through, or drop with a reason (for tests). */
export type GateResult =
  | { readonly ok: true; readonly candidate: MoveCandidate; readonly wouldHitPawnId: string | null }
  | { readonly ok: false; readonly reason: GateReason };

export type GateReason =
  | 'OVERSHOOT'            // toIndex > 48 (not exact finish)
  | 'INNER_PATH_NO_HIT'    // crossing into ring beyond outer without hasHit
  | 'OWN_PAWN'             // destination occupied by own pawn
  | 'OPP_SAFE_BLOCKED';    // destination is opponent on a safe house

// ---- Candidate generation ----
/** roll===1 -> one 'enter' candidate per home pawn (toIndex 0);
 *  any roll -> one 'move' candidate per active pawn (toIndex = fromIndex + rollValue). */
export function generateCandidates(ctx: MoveContext): readonly MoveCandidate[];

// ---- The ORDERED gate chain. Order is normative. Each gate is pure & exported for unit test. ----
// G-1 withinBounds: toIndex <= 48; exact-finish ok; overshoot drops.            (CB3-AC6/AC7, exact finish)
export function withinBounds(c: MoveCandidate): GateResult;
// G-2 innerPathGate: pass if player.hasHit OR toIndex < 24 (MIDDLE_RING_START_INDEX). [L7] (CB3-AC8/AC9)
export function innerPathGate(c: MoveCandidate, ctx: MoveContext): GateResult;
// G-3 destinationRule: read occ at coordAt(side,toIndex):
//     empty -> ok(hit=null); ownPawn -> drop OWN_PAWN; oppSafe -> drop OPP_SAFE_BLOCKED;
//     oppUnsafe -> ok(hit=oppPawnId).                                            (CB3-AC3/AC4/AC5)
export function destinationRule(c: MoveCandidate, ctx: MoveContext): GateResult;

/** Runs G-1 -> G-2 -> G-3 in order; returns only surviving moves as LegalMove[]. */
export function generateLegalMoves(state: GameState, env: DomainEnv): readonly LegalMove[];
```

Note: entry candidates (`toIndex === 0`) pass `withinBounds` and `innerPathGate` (0 < 24) trivially, then hit `destinationRule` at the start house — that is where CB3-FR5 (own pawn on start) and CB3-FR6 (safe opponent on start) are enforced. No separate entry-only predicate needed (KISS, DRY).

### 2.7 `src/domain/reducer.ts` — validate → apply → resolveTurn **[L3]**

```ts
/** Single entry point. validate -> apply -> resolveTurn -> assertInvariants (dev). */
export function applyCommand(state: GameState, command: GameCommand, env: DomainEnv): ApplyResult;

/**
 * Pure turn-resolution. Called by applyCommand AFTER a move is applied,
 * AND directly on the "no legal moves" branch (auto-resolve, no SELECT_MOVE) [L3].
 *   bonus = grantsBonus(roll.value) || didHit
 *   bonus && !gameOver -> same player stays current, clear currentRoll/legalMoves, await next ROLL
 *   else -> advance currentPlayerId to next non-resigned player in playerOrder
 * Emits BONUS / TURN_ADVANCE / SKIP / WIN events.
 */
export function resolveTurn(state: GameState, ctx: ResolveContext, env: DomainEnv): { state: GameState; events: readonly GameEvent[] };

export interface ResolveContext {
  readonly didHit: boolean;
  readonly rollValue: RollValue | null; // null when resolving a turn with no roll context
  readonly gameOver: boolean;
}
```

Internal (non-exported) pure helpers: `validateCommand`, `applyRoll`, `applyMove` (handles enter/move/hit/finish + sets `player.hasHit`), `checkWinner`, `advanceCurrentPlayer`. The **ROLL** handler computes `legalMoves` via `generateLegalMoves`; if empty, it immediately calls `resolveTurn` (with `didHit=false`) so a turn with no moves never waits for a `SELECT_MOVE` (**L3**, CB4-FR5). Idempotency (`DUPLICATE_COMMAND`) and config-lock (`CONFIG_LOCKED`, CB1-AC3) are checked first in `validateCommand`.

### 2.8 `src/domain/invariants.ts` **[L5]**

```ts
export class InvariantError extends Error {
  constructor(public readonly code: string, message: string);
}
/** Throws InvariantError on first violation. Called at end of every transition in dev/test. */
export function assertInvariants(state: GameState): void;
```

Checks I-CB1..I-CB17, notably: I-CB3 (each active pawn → exactly one Coord via path), I-CB4 (occupancy has no duplicate key — built from active pawns, size === active pawn count), I-CB5 (home pawns have `pathIndex === null`), I-CB6 (finished pawns absent from occupancy), I-CB8 (roll ∈ {1..6,12}), I-CB12 (finished pawns have `pathIndex === 48`), I-CB15 (winner ⇒ status `finished`).

### 2.9 `src/domain/history.ts`

```ts
export const MAX_HISTORY = 200; // bounded retention (CB4-FR8 DoD)
export function makeEvent(type: GameEventType, env: DomainEnv, playerId: string | null, data?: Record<string, unknown>): GameEvent;
export function appendEvents(history: readonly GameEvent[], events: readonly GameEvent[], max?: number): readonly GameEvent[]; // drops oldest beyond max
```

---

## 3. Transport port + Fake contract **[L6]**

The port is designed against the **transaction** (compare-and-set on `expectedRevision`). The reducer validates **inside** the transaction body.

```ts
// src/transport/game-transport.ts
export type Unsubscribe = () => void;

export interface CommandResult {
  readonly accepted: boolean;
  readonly revision: number;           // resulting (or current, if rejected) revision
  readonly rejection?: CommandRejectionCode;
}

export interface GameTransport {
  createRoom(input: CreateRoomInput): Promise<CreateRoomResult>;
  joinRoom(input: JoinRoomInput): Promise<JoinRoomResult>;
  subscribeRoom(gameId: string, onState: (state: GameState) => void): Unsubscribe;
  /**
   * CAS transaction:
   *   read current state -> if state.revision !== command.expectedRevision -> reject STALE_REVISION (no mutation)
   *   if command.commandId already applied -> return accepted:true idempotently (no re-apply) [I-CB16]
   *   else applyCommand(state, command, env); if accepted -> persist (revision+1) atomically; broadcast.
   */
  transactCommand(command: GameCommand): Promise<CommandResult>;
  updatePresence(gameId: string, playerId: string, status: PlayerStatus): Promise<void>;
}
```

### FakeTransport contract (first implementation; concurrency test target)

```ts
// src/transport/fake-transport.ts
export class FakeTransport implements GameTransport {
  constructor(env: DomainEnv);
  /** Test seam: serialize concurrent transactCommand calls; second CAS at same revision must reject. */
  // Implementation guarantees:
  //  C1. Two commands with the same expectedRevision: exactly one mutates (CB5-AC6).
  //  C2. Replaying a commandId never double-applies (CB4-AC7, I-CB16).
  //  C3. Invalid command leaves state byte-identical (CB4 rejections).
  //  C4. subscribeRoom fires once per accepted mutation with the new state.
  //  C5. State round-trips through structuredClone/JSON without losing enum/readonly semantics.
}
```

The concurrent-conflict integration test (CB5-AC6) runs against `FakeTransport`. Firebase/Supabase adapters must satisfy the same C1–C5 contract using their native transaction primitives (Firestore `runTransaction`, Supabase RPC/`SELECT ... FOR UPDATE` or optimistic `revision` column with `WHERE revision = expected`).

### Clock / IdSource (production vs test)

```ts
export const systemClock: Clock = { now: () => Date.now() };       // app layer only, NOT domain
export const uuidIdSource: IdSource = { next: () => crypto.randomUUID() };
export const fixedClock = (start: number, step = 1): Clock => …;    // tests
export const seqIdSource = (prefix = 'id'): IdSource => …;          // tests: id-0, id-1…
```

`systemClock`/`uuidIdSource` are constructed in the **app layer** and injected down. Domain code only ever sees the interfaces (**B3**).

---

## 4. Rule decisions (normative)

### 4.1 Forced-move rule (no voluntary pass)
When `legalMoves` is non-empty, the current player **must** select one — there is no PASS command. `SELECT_MOVE` is the only legal continuation. A turn auto-resolves (skips) **only** when `generateLegalMoves` returns empty; the reducer then runs `resolveTurn` itself (no client action), emitting a `SKIP` event (**L3**, CB4-FR5, Edge: "Roll 1 while all home pawns blocked"). Rationale: prevents stalling and keeps the state machine driven by the reducer, not the UI.

### 4.2 Turn-order direction for 3 / 4 players
`playerOrder` is built at `START_GAME` from seated players, **sorted by side in fixed canonical order** `south → east → north → west`, omitting unseated sides. Turn advancement walks `playerOrder` forward (index+1 mod length), skipping `resigned`/`disconnected`-but-the-spec-keeps-their-seat players per CB4-FR7 (skip resigned; disconnected players are *not* skipped in v0.1 — no auto-play, Edge "Disconnected current player").

- 2 players → sides South, North (spec CB5-AC2) → order `[south, north]`.
- 3 players → South, East, North (CB5-AC3) → order `[south, east, north]`.
- 4 players → South, East, North, West (CB5-AC4) → order `[south, east, north, west]`.

This canonical order is **anti-clockwise around the board** (matches the South path's anti-clockwise travel) and is deterministic regardless of join order (CB5-FR5). (Gap G3: spec lists the *sides* per count but never states the *rotation direction* of turn-taking — fixed here.)

### 4.3 Soft-lock edge case
A "soft-lock" = current player has *no* legal move and *no* bonus, but turn cannot progress to a win.
- Handled by §4.1 auto-resolve: emit `SKIP`, advance to next player. The game continues; it cannot deadlock because every roll either produces a move, grants a bonus (re-roll, **L3** `bonus`), or advances the turn.
- **Bonus + no-move loop** (`tripleBonusRule: "disabled"`): a 6/12 with no legal move re-rolls the *same* player. With `disabled`, this can repeat. We bound it defensively: track `turnChainRollCount`; if it exceeds a safety cap (`MAX_TURN_CHAIN = 64`), force a `TURN_ADVANCE` and emit a `SKIP` (prevents a pathological infinite bonus chain from a tampered/seeded source). The cap is a *safety net*, not a game rule, and is documented as such. (Gap G4: spec's `tripleBonusRule` is referenced but its `"ignoreThirdAndPass"` branch is never specified; left unimplemented in v0.1, only `"disabled"` is wired.)
- All-but-one resigned → remaining player wins immediately (`WIN`, status `finished`, CB Edge "All other players resigned").

---

## 5. Recommended build order & feature → commit mapping

Host-testable-first: domain core (no React/network) before adapters before UI. Each row is one (or few) gated commit(s); commit criteria = no lint/format/type errors, domain coverage ≥97%.

| Order | Commit scope | Spec feature | Key modules | Tests gating the commit |
|---|---|---|---|---|
| 1 | Board + paths + occupancy key + config lock | **CB1** | `board.ts`, `paths.ts`, `types.ts` | path length/unique/bounds/start/finish (all 4 sides); `coordKey` round-trip; config immutability |
| 2 | Cowrie scoring + random source + bonus | **CB2** | `cowries.ts` | 0–6 open → value; bonus 6/12; len≠6 throws; seeded determinism |
| 3 | Occupancy + legal-move predicate chain | **CB3** (gen) | `occupancy.ts`, `legal-moves.ts` | each gate unit-tested 1:1 to CB3-AC1..AC9; entry/own-block/safe-block/hit/inner-gate/exact-finish |
| 4 | Reducer: validate→apply→resolveTurn + invariants + history | **CB3** (apply) + **CB4** | `reducer.ts`, `invariants.ts`, `history.ts` | CB4-AC1..AC7; winner CB3-AC10; auto-skip; idempotency; `assertInvariants` green throughout |
| 5 | Transport port + FakeTransport + CAS/idempotency | **CB5** (engine) | `game-transport.ts`, `fake-transport.ts` | concurrent-conflict CB5-AC6 (C1); idempotent replay (C2); serialization round-trip (C5) |
| 6 | App service: room lifecycle, sides, reconnect token | **CB5** (flows) | `app/services/game-service.ts` | start gating CB5-AC1..AC5; reconnect CB5-AC7; spectator |
| 7 | React UI: Board/House/Pawn/Cowrie/MovePicker/History | **CB6** | `components/*`, `pages/*` | render-from-reducer; legal-only interactive; a11y/keyboard (UI coverage separate) |
| 8 | Real adapter (Firebase or Supabase) | **CB5** (prod) | `transport/firebase-transport.ts` or `supabase-transport.ts` | adapter satisfies C1–C5 against a test harness |
| 9 | Vite GH-Pages build + CI/CD workflows + no-secrets check | **CB7** | `vite.config`, `.github/workflows/*` | `dist/` static-only; base-path routing; secret-scan |
| 10 | README rules + in-game Rules panel + ruleset versioning | **CB8** | `README.md`, Rules panel, `ruleset` field | ruleset stored per game; old game uses stored ruleset |

Critical path for a *playable* engine: commits 1–6. UI (7) and real transport (8) can proceed in parallel branches once the FakeTransport contract (5) is frozen.

---

## 6. Component-facing API contract (what the UI consumes)

The UI is a **pure function of `GameState`** plus a `dispatch(command)`:

- **Render inputs:** `GameState.players`, `playerOrder`, `currentPlayerId`, `pawns` (state + `pathIndex` → resolve via `coordAt(side, pathIndex)`), `currentRoll` (faces + value + bonus), `legalMoves`, `history`, `status`, `winnerPlayerId`.
- **Highlighting:** UI highlights exactly the cells/pawns named in `legalMoves` (each move carries `pawnId`, `from`, `to`, `wouldHitPawnId`, `wouldFinish`). UI never computes legality (**B2**).
- **Dispatch:** UI builds a `GameCommand` (with `commandId` from IdSource, `expectedRevision = state.revision`) and calls `transport.transactCommand`. Subscription pushes the next `GameState`; React re-renders.
- **Skip explanation (CB6-FR12):** when a `SKIP` event appears with no preceding `MOVE`, UI reads the event `data.reason` to explain why (e.g., all entries blocked / inner-path gate / overshoot).

---

## 7. Determinism & replay

- Every nondeterministic value enters via `DomainEnv` (**L4**). A recorded command log + seeded `CowrieRandomSource` + `fixedClock` + `seqIdSource` reproduces any game byte-for-byte → enables replay tests and the idempotency tests (I-CB16).
- `transactCommand` is the only place revision increments; CAS makes concurrent submits safe (I-CB17).

---

## 8. Invariant → assertion mapping (summary)

I-CB1 (B1 lint) · I-CB2 (B2) · I-CB3/4/5/6 (occupancy build + size check) · I-CB7 (entry gate in candidate gen, roll===1) · I-CB8 (`scoreCowries` range) · I-CB9 (`grantsBonus`) · I-CB10 (`applyMove` sets `hasHit`, `resolveTurn` bonus) · I-CB11 (`innerPathGate`) · I-CB12 (`withinBounds` exact-finish) · I-CB13 (`destinationRule` OPP_SAFE_BLOCKED) · I-CB14 (no Gatti code path exists) · I-CB15 (`checkWinner` → status) · I-CB16 (transport idempotency) · I-CB17 (transport CAS).

---

## 9. Open design choices deferred (not blocking v0.1)

- Real backend selection (Firebase vs Supabase) — both satisfy the same `GameTransport` contract; pick at commit 8. Recommend **Supabase** (Postgres `revision` column + RLS gives a clean optimistic-CAS story and is open-source friendly).
- 6-pawn long mode, commit-reveal fair-roll: future ruleset ids only (CB8-FR5).

---

## 10. Spec gaps / risks for the lead to fold into the SPEC

| ID | Gap / risk | Recommendation |
|---|---|---|
| **G1** | No named turn **phase**; `SELECT_MOVE`-before-`ROLL` rejection (CB4-AC2) needs a phase to test against. | Add derived phase (`awaiting-roll` / `awaiting-move`) to the spec's state model. No new stored field needed. |
| **G2** | Constant `innerPathStartIndex: 24` is **misnamed** — index 24 is the 5x5 *middle*-ring entry; the true 3x3 inner ring is index 40. Gating at the wrong landmark is a latent bug. **[L7]** | Rename to `middleRingStartIndex` (or `outerRingExitIndex`); clarify that "inner path" in DEV-CB7/CB3-FR13 means "beyond the outer ring" (≥24). Keep old name as deprecated alias for stored games. |
| **G3** | Turn-order **direction** for 3/4 players is unspecified (only the side *set* is given). | Specify canonical order `south→east→north→west` (anti-clockwise), independent of join order. |
| **G4** | `tripleBonusRule: "ignoreThirdAndPass"` is declared in `GameConfig` but its behavior is **never defined**; the unbounded bonus-reroll loop has no guard. | Either fully specify `ignoreThirdAndPass`, or drop it from v0.1 config. Add a documented `MAX_TURN_CHAIN` safety cap. |
| **G5** | Coverage targets conflict: spec NFR says engine ≥95% / project ≥85%, but project CLAUDE.md mandates ≥97%. **[L8]** | Resolve to: domain+app logic ≥97%; UI measured separately, best-effort. Update the NFR. |
| **G6** | Constants are duplicated: `safeHouses`/`innerPathStartIndex`/`finishIndex` appear both in `GameConfig` (interface §Interfaces) and as `board.ts` constants. Risk of drift. **[L9]** | Declare `board.ts` the single source; `GameConfig` references the board constants, never literal-duplicates them. |
| **G7** | `pawnsPerPlayer: 4 \| 6` but DoD/AC only test the 4-pawn path; 6-pawn is "future" yet typed into default config. | Fix default to `4`; document 6 as a future ruleset, keep the union for forward-compat. |
| **G8** | Spec uses `pathIndex` in `Pawn` and in `LegalMove` (`toIndex`) but occupancy/collision is physically by **Coord** — easy to mistakenly key occupancy by `pathIndex`. **[L1]** | Add an explicit note in the spec's Data Model: "occupancy is Coord-keyed; pawn identity carries `pathIndex`, but all collision checks resolve to `Coord` first." |
| **G9** | Disconnected-but-current player: spec says "no auto-play" but turn-advance (CB4-FR7) skips only `resigned`. A disconnected current player can stall the room. | Confirm v0.1 behavior: room stalls (acceptable for friendly play) OR add an optional host-skip. Document the chosen behavior. |
| **G10** | `CowrieRandomSource`, `Clock`, `IdSource` are required by the determinism learnings but absent from the spec's Interfaces section. **[L4]** | Add these three ports to the spec's Interfaces so they are contractual, not incidental. |

---

## Appendix — verification evidence

Re-ran the lead's path verification (node): `SOUTH_PATH` length 49, all coords unique & in-bounds; idx0 `[6,3]`, idx23 `[6,2]`, idx24 `[5,2]`, idx40 `[4,3]`, idx48 `[3,3]`. Rotations: west start `[3,0]`, north `[0,3]`, east `[3,6]`, all finish `[3,3]`, all length 49 & unique. Confirms **L7** (24 = middle-ring entry, not inner ring).
