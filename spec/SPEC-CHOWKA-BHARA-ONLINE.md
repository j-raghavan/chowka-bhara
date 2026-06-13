# Chowka Bhara Online — 7×7 GitHub Pages Game

## Metadata

- **Status:** Proposed (game rules + implementation spec)
- **Owner:** J-Raghavan
- **Version:** 0.2
- **Last Updated:** 2026-06-13
- **Companion docs:** `docs/adr/ADR-0001-architecture.md` (module APIs & decisions), `docs/DESIGN-UI.md` (UI component contracts)
- **Changelog:** v0.2 folds in implementation learnings (occupancy-by-Coord, predicate-chain legal moves, deterministic injection, executable invariants, transaction-first transport, constant rename, resolved coverage target). See "Implementation Learnings (Normative)".
- **Branch:** `feat/chowka-bhara-online`
- **Target repo:** `chowka-bhara-online`
- **Target hosting:** GitHub Pages static web app
- **Game mode:** Online-only multiplayer, 2–4 players
- **Board:** 7×7 Chowka Bhara / Chowka Bara
- **Rule authority:** This spec is self-contained. Where public sources and regional variants conflict, the project-specific decisions below are authoritative.
- **Template basis:** `SPEC-FIREFOX-SUPPORT.md` structure: metadata, implementation deviations, stakeholder decisions, goals/non-goals, definitions, use cases, architecture, workflow, interfaces, data model, features with FR/AC/DoD, invariants, edge cases, security, tests, global DoD, risks, and sources.

## Implementation deviations from common published variants

These deviations define the exact playable version for this project. Public Chowka Bhara / Chowka Bara rules differ by region, board size, cowrie count, pawn count, entry rules, stacking, and bonus rules. This game intentionally implements one strict 7×7 rule set first.

- **DEV-CB1 — Six cowries, not four.** The game uses exactly **6 cowries**. Open cowries score their count; zero open cowries score **12**. All six open cowries score **6**, called **Chowka**.
- **DEV-CB2 — Entry only on 1.** A pawn may enter the board from home only when the player rolls **1**. Rolls 2, 3, 4, 5, 6, and 12 cannot introduce a new pawn.
- **DEV-CB3 — No stacking.** No two active pawns may occupy the same board house at the end of any move. This applies to both same-player pawns and opponent pawns.
- **DEV-CB4 — No Gatti / double / paired-pawn rule.** The implementation has no Gatti, no double, no paired movement, no blockade, no stack protection, and no special powers for multiple pawns. Since stacking is forbidden, the concept is out of scope entirely.
- **DEV-CB5 — Landing on an opponent causes a hit.** If a pawn legally lands on a non-safe house occupied by an opponent pawn, the opponent pawn is hit and sent home/off-board; the moving pawn occupies that house.
- **DEV-CB6 — Safe occupied houses are blocked.** Since stacking is forbidden and safe houses protect pawns from being hit, a player may not land on any safe house currently occupied by an opponent pawn.
- **DEV-CB7 — Hit required before inner path.** A player must hit at least one opponent pawn before any of that player's pawns can enter the inner path toward the center.
- **DEV-CB8 — Static hosting, realtime backend by adapter.** The UI is hosted on GitHub Pages. Realtime state sync is provided by an external adapter such as Firebase, Supabase, PartyKit, or WebRTC signaling. The game rules engine is backend-agnostic.

### Stakeholder decisions

| # | Decision | Rationale |
|---|---|---|
| D-CB1 | **Implement one strict 7×7 rule set first.** | Regional variants are numerous. A strict default avoids ambiguity and makes the game testable. |
| D-CB2 | **Use 6 cowries and 1-only pawn entry.** | This matches the target rule correction for the project and aligns with 7-house descriptions that use six cowries. |
| D-CB3 | **Forbid stacking entirely.** | The user explicitly corrected the model: no two pawns occupy the same house. This also removes Gatti complexity. |
| D-CB4 | **Safe houses protect but do not allow sharing.** | Traditional safe houses prevent hits. The no-stacking rule means an occupied safe house becomes blocked, not shared. |
| D-CB5 | **Rules engine is pure and deterministic.** | All legal moves and state transitions must be testable without React, DOM, network, or Firebase/Supabase. |
| D-CB6 | **Realtime adapter is replaceable.** | GitHub Pages cannot run a server. A `GameTransport` port isolates the app from Firebase/Supabase/PartyKit/WebRTC. |
| D-CB7 | **Serverless trust model for v0.1, optional authoritative mode later.** | The first release prioritizes playability and open-source simplicity. Tamper-resistant authoritative hosting can be added later. |
| D-CB8 | **No AI, no bots, no matchmaking in MVP.** | MVP is online room-based play among invited players. Bots and matchmaking are later features. |

---

## Implementation Learnings (Normative)

These were derived during spec verification and are **binding** on the implementation. They refine — never relax — the rules above.

### L-CB1 — Occupancy is keyed by resolved board `Coord`, never by `pathIndex`

All four player paths are rotations of one another and **physically overlap** (the entire 24-cell perimeter is shared; only the entry point differs). Therefore:

- Two pawns at the **same** `pathIndex` are on **different** physical houses.
- Two pawns at **different** `pathIndex` values can occupy the **same** physical house.

Every spatial rule — own-block, hit, safe-house block, no-stacking — **MUST** read from a single occupancy map keyed by resolved coordinate:

```ts
type CoordKey = `${number},${number}`;            // "row,col"
const coordKey = ([r, c]: Coord): CoordKey => `${r},${c}`;
// occupancy(state): Map<CoordKey, Pawn> built from PATHS[side][pathIndex] for every active pawn.
```

Reading `pathIndex` directly for any collision check is a defect. This is captured as invariant **I-CB18**.

### L-CB2 — Legal moves: candidates → ordered predicate chain

`generateLegalMoves(state)` MUST (a) build candidates — one `enter` candidate per home pawn **iff** `roll === 1`, plus one `advance` candidate per active pawn at `pathIndex + rollValue` — then (b) pass each candidate through an **ordered, individually-testable** predicate chain. Each gate maps 1:1 to an Acceptance Criterion:

1. `withinBounds` — `toIndex <= FINISH_INDEX (48)`; overshoot **drops** the candidate (exact-finish rule, CB3-FR8).
2. `innerPathGate` — allowed iff `player.hasHit === true` **or** `toIndex < OUTER_RING_EXIT_INDEX (24)` (CB3-FR13).
3. `destinationRule` — resolve the destination `Coord` via the occupancy map: empty ⇒ legal; own pawn ⇒ reject (CB3-FR9); opponent on safe house ⇒ reject (CB3-FR11); opponent on non-safe house ⇒ legal **hit** (CB3-FR10).

The resulting `LegalMove` carries `wouldHitPawnId` and `wouldFinish` so the reducer never recomputes them.

### L-CB3 — Reducer = `validate → apply → resolveTurn`; turn resolution is pure

`resolveTurn(state, { rolledBonus, didHit, hadLegalMoves })` is its own pure function. `bonus = rolledBonus(6|12) || didHit`. The **no-legal-moves** branch auto-resolves the turn without a `SELECT_MOVE` command (CB4-FR5): if the roll was a bonus value the same player re-rolls, otherwise the turn advances.

### L-CB4 — Determinism is injected, not ambient

Domain code MUST NOT call `Math.random()` or `Date.now()`. Three injected ports make every transition replayable and every test deterministic:

```ts
export interface CowrieRandomSource { nextFaces(count: 6): readonly CowrieFace[]; }
export interface Clock { now(): number; }
export interface IdSource { next(prefix: string): string; }
```

These are passed into the application layer; the pure reducer receives already-rolled faces, timestamps, and ids inside commands/events. This is what makes the idempotency (CB4-AC7) and replay tests possible.

### L-CB5 — Invariants are executable

`assertInvariants(state): void` encodes I-CB1…I-CB19 and is called at the end of **every** reducer transition in dev/test builds (compiled out / no-op in production). It is the fastest detector of an L-CB1 occupancy regression.

### L-CB6 — Transport is designed against the transaction; FakeTransport first

The `GameTransport` port is specified against a compare-and-set on `expectedRevision`. An in-memory `FakeTransport` is implemented **first** and the concurrent-conflict test (CB5-AC6) runs against it; real Firebase/Supabase adapters must satisfy the **same** contract. The reducer is re-run **inside** the transaction body before committing — a plain `set`/upsert (last-write-wins) is non-conformant.

### L-CB7 — Constant rename to prevent gating at the wrong ring

The former `innerPathStartIndex` (value 24) is the **exit of the outer ring / entry to the 5×5 middle ring**, not the 3×3 innermost ring (index 40). It is renamed **`OUTER_RING_EXIT_INDEX` / `outerRingExitIndex`** throughout. The hit-before-inner-path gate fires at index 24.

### L-CB8 — Resolved coverage target

Superseding the looser numbers below: **domain + application + transport logic ≥ 97%** (statements/branches/functions/lines), enforced in CI via Vitest thresholds. UI component coverage is best-effort and measured separately (not gated at 97%).

### L-CB9 — Single source of truth for board constants

`OUTER_RING_EXIT_INDEX`, `FINISH_INDEX`, `OUTER_RING_LAST_INDEX`, `SAFE_HOUSES`, and `START_HOUSES` are defined once in `src/domain/board.ts`. `GameConfig` **references** them; it does not re-declare literal copies that can drift.

### L-CB10 — Forced move and turn-order direction

- **No voluntary pass.** When `legalMoves` is non-empty the current player MUST select one; passing is only the automatic result of having **zero** legal moves (invariant **I-CB19**).
- **Seating/turn order** is the fixed canonical order `south → east → north → west`, filtered to seated players (independent of join order). 2P = south, north (opposite). 3P = south, east, north. 4P = south, east, north, west — exactly matching CB5-AC2…AC4. `playerOrder` is derived from this canonical order.
- **Soft-lock edge** (a player parked just before index 24 who never lands a hit): resolvable because all players share the outer ring and can seek a hit there, and new pawns enter on roll 1. A dedicated test asserts the player simply has no legal move and the turn passes, without deadlocking the game.

### L-CB11 — Design-round refinements (architect + designer feedback)

Folded in from the parallel architecture and UI design review. None of these change game rules; they expose already-computed facts to the view and harden edge handling.

- **Derived turn phase (not stored).** The UI keys off `phase`, derived from state: `awaiting-roll` when `currentRoll === null`; `awaiting-move` when `currentRoll !== null && legalMoves.length > 0`. Makes CB4 phase rules testable. The reducer never persists a redundant phase field.
- **`applyCommand` return shape.** `applyCommand(env, state, command) => { state, accepted: boolean, rejection?: RejectionReason, events: GameEvent[] }`. The UI renders `state` and feeds `events` to the history log.
- **`SELECT_MOVE` references reducer output.** Its payload carries a `moveId` (a `LegalMove.id`); the reducer validates membership in `legalMoves` (CB4-FR4). The UI never reconstructs moves.
- **`hostId` on `GameState`** (plus derived `isHost`) so the Start button is gated by CB5-FR6 without out-of-band data.
- **`skipReason` on `SKIP` events.** When a roll yields zero legal moves, the `SKIP` event carries `reason: 'start-blocked' | 'all-targets-blocked' | 'inner-path-locked' | 'would-overshoot' | 'mixed'`, satisfying CB6-FR12 without the UI re-deriving blocking logic.
- **Hit-bonus surfaced.** The `MOVE`/`HIT` event records whether the move granted a bonus turn (complements `CowrieRoll.grantsBonusTurn`) so the UI announces bonus turns without inferring.
- **Domain render helpers.** `coordForPawn(state, pawnId): Coord | null` and `pathTrail(side, fromIndex, toIndex): readonly Coord[]` live in the domain so the Board renders placement/previews along the true path (handling ring-transition jumps and the diagonal index 47→48 hop) without owning path math.
- **`MAX_TURN_CHAIN` safety cap.** `tripleBonusRule` is **reserved/`"disabled"` only** in v0.1 (its `"ignoreThirdAndPass"` behavior is not implemented). The bonus-reroll loop is bounded by `MAX_TURN_CHAIN = 64` to guarantee termination; reaching it ends the turn. Documented in Edge Cases.
- **Disconnected current player.** v0.1 confirms the room **stalls** on a disconnected current player (no auto-play, no auto-skip). Optional host-skip is deferred to a later version (already noted in Edge Cases / R-CB-reconnect).
- **Default `pawnsPerPlayer = 4`.** The `4 | 6` union is retained for forward compatibility, but v0.1 ships and tests `4`; `6` is future-only (Appendix B).

---

## Summary

This spec defines an open-source, online-only implementation of **Chowka Bhara / Chowka Bara** as a **7×7 browser game hosted on GitHub Pages**. The game supports **2 to 4 players**, shareable rooms, realtime turns, 6-cowrie rolls, strict no-stacking occupancy, hits, safe houses, a capture-before-inner-path rule, exact finish to the center, and winner detection.

The implementation is intentionally split into three layers:

1. **Pure rules engine** — board path, cowrie scoring, legal moves, hit resolution, turn advancement, win detection.
2. **UI shell** — React/Vite static app for board rendering, lobby, room page, cowrie animation, move highlighting, accessibility, and game history.
3. **Realtime adapter** — Firebase/Supabase/PartyKit/WebRTC adapter behind a narrow `GameTransport` interface.

The project can be hosted as a static site because all game code runs in the browser. Since GitHub Pages does not provide server-side execution, realtime multiplayer requires an external state-sync backend or peer-to-peer signaling. This is treated as an adapter, not a rules dependency.

This spec defines eight features (CB1–CB8), each with Functional Requirements (FR), Acceptance Criteria (AC), and a Definition of Done (DoD). A global Definition of Done gates the v0.1 playable release.

---

## Goals

- **Playable 7×7 Chowka Bhara online.** Two to four invited players can create/join a room and complete a full game in the browser.
- **Strict rule clarity.** Six cowries, entry only on 1, no stacking, no Gatti, hit on opponent landing, safe-house blocking, hit-before-inner-path, exact center finish.
- **GitHub Pages deployable.** The app builds to static files and can be deployed from GitHub Actions to GitHub Pages.
- **Realtime multiplayer.** Shared room state syncs across connected browsers with optimistic UI only where it cannot violate rules.
- **Pure, tested rules engine.** The rules layer has no dependency on React, DOM, browser storage, or network APIs.
- **Open-source maintainability.** TypeScript types, reducer-style state transitions, high test coverage, documented rule decisions, and clean architecture.
- **Regional-variant ready, but not variant-heavy.** The default mode is fixed. Future variants are supported by config only after the core rules are stable.

## Non-Goals

- **No offline/local-only mode in v0.1.** The project is online-only. A local pass-and-play mode may be added later, but is out of scope for the first release.
- **No bot players.** AI/bot opponents are out of scope.
- **No public matchmaking.** v0.1 uses shareable game links only.
- **No rankings, accounts, or persistent profiles.** Players identify themselves by room-local display name.
- **No Gatti / double / blockade.** Explicitly out of scope by project decision.
- **No stack movement.** Since stacking is illegal, stack movement does not exist.
- **No money, betting, rewards, or prizes.** This is a casual cultural board game implementation.
- **No authoritative anti-cheat server in v0.1.** The reducer validates moves locally and state updates are transaction-guarded, but v0.1 is not designed for adversarial play.
- **No mobile app wrapper.** Browser-first responsive UI only.

---

## Definitions

| Term | Definition |
|---|---|
| **House** | One cell on the 7×7 board. Coordinates are zero-based `[row, col]`. |
| **Board** | A 7×7 grid with 49 houses. The center `[3,3]` is the finish. |
| **Pawn** | A player's movable piece. Each pawn is `home`, `active`, or `finished`. |
| **Home / off-board** | The non-board holding area for pawns that have not entered or have been hit. Home pawns do not occupy a board house. |
| **Start house** | The board entry point for a player. A pawn enters this house only on roll 1 if unoccupied or legally hittable. |
| **Safe house** | A protected board house where a pawn cannot be hit. In this implementation, an occupied safe house is blocked because stacking is forbidden. |
| **Center** | The finish house `[3,3]`. A pawn must land exactly on it to finish. |
| **Cowrie** | One shell-like binary randomizer. It has an `open` or `closed` face. The game uses exactly six cowries. |
| **Chowka** | Roll value 6, produced when all six cowries are open. Grants a bonus turn. |
| **Bhara / Bara** | Roll value 12, produced when all six cowries are closed. Grants a bonus turn. |
| **Hit** | Landing on an opponent pawn on a non-safe house. The opponent pawn is sent home/off-board. |
| **Inner path** | The path segment after the outer ring. A player may enter it only after hitting at least one opponent pawn. |
| **Legal move** | A move generated by the rules engine for the current player and roll. Only legal moves can be submitted. |
| **Turn chain** | A player's sequence of rolls and moves while receiving bonus turns from Chowka, Bhara, or hits. |
| **Room** | A multiplayer game instance identified by a shareable room code or URL. |
| **Host** | The player who creates a room and may start the game before play begins. Host has no gameplay advantage. |
| **Transport** | The realtime backend adapter used to read/write room state. |
| **Authoritative reducer** | The pure function that validates and applies commands to produce the next game state. |

---

## Use Cases

1. **Create a game room.** A player opens the GitHub Pages app, enters a display name, selects default 7×7 rules, creates a room, and receives a shareable link.
2. **Join a room.** Another player opens the link, enters a display name, takes an available seat, and waits for the host to start.
3. **Start a 2-player game.** With two players seated, the host starts the game. The game assigns opposite sides by default: South and North.
4. **Start a 3-player game.** With three players seated, the host starts the game. The game assigns South, East, and North by default.
5. **Start a 4-player game.** With four players seated, the game assigns South, East, North, and West.
6. **Enter a pawn.** A player rolls 1 and may enter exactly one home pawn onto their start house, if that house is not blocked by their own pawn or by a protected opponent pawn.
7. **Move an active pawn.** A player rolls 2, 3, 4, 5, 6, or 12 and moves one active pawn exactly that many houses if legal.
8. **Hit an opponent.** A player lands on an opponent pawn on a non-safe house; the opponent pawn is sent home, the moving pawn occupies the house, and the player receives a bonus turn.
9. **Blocked by own pawn.** A player has a pawn that could otherwise move, but its destination is occupied by their own pawn. The move is illegal.
10. **Blocked by protected opponent.** A player would land on an opponent pawn on a safe house. The move is illegal because the opponent cannot be hit and stacking is forbidden.
11. **Enter inner path.** After the player has hit at least one opponent pawn, any pawn of that player may enter the inner path.
12. **Finish a pawn.** A pawn reaches the center only by exact roll. Overshooting is illegal.
13. **Win the game.** The first player to move all their pawns to the center is declared the winner; the room status becomes `finished`.
14. **Reconnect.** A disconnected player returns to the room URL and resumes their seat using a locally stored player token.
15. **Spectate.** A late visitor may view the game if all seats are occupied, but cannot submit commands.

---

## Architecture

The app follows a ports-and-adapters architecture. The game rules are independent of the UI and realtime backend.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ GitHub Pages Static App                                                       │
│ Vite + React + TypeScript                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ UI Layer                                                                      │
│ Lobby · Board · CowrieRoll · MovePicker · PlayerPanel · History · Toasts      │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ dispatches commands / renders state
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Application Layer                                                             │
│ createRoom · joinRoom · startGame · rollCowries · selectMove · resign         │
│ command validation · idempotency · local player token                         │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ calls pure reducer
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Domain / Rules Engine                                                         │
│ board paths · cowrie scoring · legal moves · hit resolution · turn advance    │
│ exact finish · win detection · invariants                                     │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ serializable GameState
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Realtime Transport Port                                                       │
│ GameTransport: subscribeRoom · transactCommand · updatePresence · leaveSeat   │
└──────────────────┬──────────────────────┬──────────────────────┬────────────┘
                   │                      │                      │
                   ▼                      ▼                      ▼
            Firebase Adapter        Supabase Adapter        PartyKit/WebRTC Adapter
```

### Design principles

| Principle | How this spec applies it | Where |
|---|---|---|
| **DDD** | The game rules live in the domain layer and are not aware of React, Firebase, localStorage, or routing. | CB1–CB4, I-CB1 |
| **SOLID — SRP** | Board path generation, cowrie scoring, legal move generation, hit resolution, and turn advancement are separate modules. | CB1–CB3 |
| **SOLID — DIP** | App services depend on `GameTransport`, not Firebase/Supabase directly. | CB5 |
| **SOLID — OCP** | Future regional variants are added by `GameConfig` and feature flags, not by rewriting core reducers. | CB1, CB8 |
| **DRY** | Only one reducer applies commands. UI and transport never duplicate game legality rules. | I-CB2 |
| **KISS** | v0.1 avoids Gatti, bots, accounts, rankings, and authoritative servers. | Non-Goals |
| **Testability** | The rules engine can be unit-tested with deterministic cowrie results and command sequences. | Required Tests |

---

## Workflow

### Room lifecycle

```text
User opens app
    ↓
Create Room or Join Room
    ↓
Room status = lobby
    ↓
2–4 players take seats
    ↓
Host starts game
    ↓
Room status = playing
    ↓
Players take turns until winner
    ↓
Room status = finished
```

### Turn lifecycle

```text
Current player starts turn
    ↓
Player clicks Roll
    ↓
Client generates 6 cowries and submits ROLL command
    ↓
Reducer scores cowries: 1,2,3,4,5,6,12
    ↓
Reducer computes legal moves
    ├─ no legal moves
    │     ├─ roll is bonus value 6/12 → same player rolls again
    │     └─ otherwise → turn advances to next player
    └─ legal moves exist
          ↓
          UI highlights legal pawn destinations
          ↓
          Player selects a pawn/move
          ↓
          Reducer applies move
              ├─ destination has opponent pawn on non-safe house → hit, send opponent home
              ├─ destination is center → pawn finishes
              └─ normal move → pawn remains active
          ↓
          Reducer checks winner
          ↓
          Bonus?
              ├─ rolled 6 or 12 OR hit opponent → same player continues
              └─ otherwise → next player
```

### Reconnect lifecycle

```text
Player joins room
    ↓
App stores local player token
    ↓
Connection drops
    ↓
Presence marks player disconnected
    ↓
Player reloads same room URL
    ↓
App presents token
    ↓
Transport restores seat if token matches
```

---

## Interfaces

### GameConfig

```ts
export interface GameConfig {
  readonly boardSize: 7;
  readonly minPlayers: 2;
  readonly maxPlayers: 4;

  readonly cowrieCount: 6;
  readonly rollValues: readonly RollValue[];
  readonly entryRoll: 1;
  readonly bonusRolls: readonly RollValue[];

  readonly pawnsPerPlayer: 4 | 6;
  readonly requireHitBeforeInnerPath: boolean;
  readonly exactRollToFinish: boolean;

  readonly allowStacking: false;
  readonly allowGatti: false;
  readonly hitOpponentOnLanding: true;
  readonly hitGrantsBonusTurn: true;

  readonly safeHouses: readonly Coord[];
  readonly outerRingExitIndex: number; // renamed from innerPathStartIndex (L-CB7): entry to the 5x5 middle ring (24), NOT the 3x3 inner ring (40)
  readonly finishIndex: number;

  // v0.1: "disabled" only. "ignoreThirdAndPass" is reserved and NOT implemented (L-CB11).
  readonly tripleBonusRule: "disabled" | "ignoreThirdAndPass";
  readonly maxTurnChain: number; // bonus-reroll termination cap (L-CB11), default 64
}
```

Default v0.1 config:

```ts
export const DEFAULT_7X7_CONFIG: GameConfig = {
  boardSize: 7,
  minPlayers: 2,
  maxPlayers: 4,

  cowrieCount: 6,
  rollValues: [1, 2, 3, 4, 5, 6, 12],
  entryRoll: 1,
  bonusRolls: [6, 12],

  pawnsPerPlayer: 4,
  requireHitBeforeInnerPath: true,
  exactRollToFinish: true,

  allowStacking: false,
  allowGatti: false,
  hitOpponentOnLanding: true,
  hitGrantsBonusTurn: true,

  safeHouses: [
    [6, 3],
    [3, 6],
    [0, 3],
    [3, 0],
    [3, 3],
  ],

  outerRingExitIndex: 24,
  finishIndex: 48,
  tripleBonusRule: "disabled",
  maxTurnChain: 64,
};
```

### Coordinates and sides

```ts
export type Coord = readonly [row: number, col: number];
export type PlayerSide = "south" | "east" | "north" | "west";
export type PlayerStatus = "connected" | "disconnected" | "resigned";
export type GameStatus = "lobby" | "playing" | "finished" | "abandoned";
```

### Cowrie roll

```ts
export type RollValue = 1 | 2 | 3 | 4 | 5 | 6 | 12;
export type CowrieFace = "open" | "closed";

export interface CowrieRoll {
  readonly id: string;
  readonly faces: readonly CowrieFace[]; // length 6
  readonly openCount: number;
  readonly value: RollValue;
  readonly grantsBonusTurn: boolean;
  readonly rolledAt: number;
}
```

Scoring:

```ts
export function scoreCowries(faces: readonly CowrieFace[]): RollValue {
  if (faces.length !== 6) {
    throw new Error("Chowka Bhara 7x7 requires exactly 6 cowries");
  }

  const openCount = faces.filter(face => face === "open").length;
  if (openCount === 0) return 12;
  return openCount as RollValue;
}
```

### Pawn

```ts
export type PawnState = "home" | "active" | "finished";

export interface Pawn {
  readonly id: string;
  readonly playerId: string;
  readonly state: PawnState;
  readonly pathIndex: number | null;
  readonly finishedOrder: number | null;
}
```

### Player

```ts
export interface Player {
  readonly id: string;
  readonly displayName: string;
  readonly side: PlayerSide;
  readonly color: string;
  readonly status: PlayerStatus;
  readonly hasHit: boolean;
  readonly joinedAt: number;
  readonly lastSeenAt: number;
}
```

### GameState

```ts
export interface GameState {
  readonly schemaVersion: 1;
  readonly gameId: string;
  readonly status: GameStatus;
  readonly config: GameConfig;

  readonly players: Readonly<Record<string, Player>>;
  readonly playerOrder: readonly string[];
  readonly currentPlayerId: string | null;

  readonly pawns: Readonly<Record<string, Pawn>>;
  readonly currentRoll: CowrieRoll | null;
  readonly legalMoves: readonly LegalMove[];

  readonly turnNumber: number;
  readonly turnChainRollCount: number;
  readonly winnerPlayerId: string | null;

  readonly history: readonly GameEvent[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly revision: number;
}
```

### LegalMove

```ts
export type LegalMoveType = "enter" | "move";

export interface LegalMove {
  readonly id: string;
  readonly type: LegalMoveType;
  readonly playerId: string;
  readonly pawnId: string;
  readonly rollValue: RollValue;
  readonly from: Coord | null;
  readonly to: Coord;
  readonly fromIndex: number | null;
  readonly toIndex: number;
  readonly wouldHitPawnId: string | null;
  readonly wouldFinish: boolean;
}
```

### Commands

```ts
export type GameCommand =
  | CreateRoomCommand
  | JoinRoomCommand
  | LeaveRoomCommand
  | StartGameCommand
  | RollCowriesCommand
  | SelectMoveCommand
  | ResignCommand;
```

Every command must include an idempotency key:

```ts
interface BaseCommand {
  readonly commandId: string;
  readonly gameId: string;
  readonly playerId: string;
  readonly expectedRevision: number;
  readonly issuedAt: number;
}
```

### GameTransport

```ts
export interface GameTransport {
  createRoom(input: CreateRoomInput): Promise<CreateRoomResult>;
  joinRoom(input: JoinRoomInput): Promise<JoinRoomResult>;
  subscribeRoom(gameId: string, onState: (state: GameState) => void): Unsubscribe;
  transactCommand(command: GameCommand): Promise<CommandResult>;
  updatePresence(gameId: string, playerId: string, status: PlayerStatus): Promise<void>;
}
```

Transport requirements:

```text
1. Commands must be applied transactionally against the expected revision.
2. Duplicate command IDs must be ignored idempotently.
3. Invalid commands must not mutate room state.
4. All clients receive the same resulting GameState.
```

---

## Board and Path

### Coordinate system

The board is zero-indexed:

```text
[0,0] [0,1] [0,2] [0,3] [0,4] [0,5] [0,6]
[1,0] [1,1] [1,2] [1,3] [1,4] [1,5] [1,6]
[2,0] [2,1] [2,2] [2,3] [2,4] [2,5] [2,6]
[3,0] [3,1] [3,2] [3,3] [3,4] [3,5] [3,6]
[4,0] [4,1] [4,2] [4,3] [4,4] [4,5] [4,6]
[5,0] [5,1] [5,2] [5,3] [5,4] [5,5] [5,6]
[6,0] [6,1] [6,2] [6,3] [6,4] [6,5] [6,6]
```

Start houses:

```ts
export const START_HOUSES: Record<PlayerSide, Coord> = {
  south: [6, 3],
  east: [3, 6],
  north: [0, 3],
  west: [3, 0],
};
```

Safe houses:

```ts
export const SAFE_HOUSES: readonly Coord[] = [
  [6, 3],
  [3, 6],
  [0, 3],
  [3, 0],
  [3, 3],
];
```

### Canonical South path

The South path is the canonical path. Other player paths are rotations around the center.

```ts
export const SOUTH_PATH: readonly Coord[] = [
  // Start
  [6, 3],

  // Outer ring, anti-clockwise from South start
  [6, 4], [6, 5], [6, 6],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 5], [0, 4], [0, 3], [0, 2], [0, 1], [0, 0],
  [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0],
  [6, 1], [6, 2],

  // Middle ring
  [5, 2], [5, 1],
  [4, 1], [3, 1], [2, 1], [1, 1],
  [1, 2], [1, 3], [1, 4], [1, 5],
  [2, 5], [3, 5], [4, 5], [5, 5],
  [5, 4], [5, 3],

  // Inner ring
  [4, 3], [4, 4], [3, 4], [2, 4],
  [2, 3], [2, 2], [3, 2], [4, 2],

  // Finish
  [3, 3],
];
```

Constants:

```ts
export const OUTER_RING_LAST_INDEX = 23;
export const OUTER_RING_EXIT_INDEX = 24; // renamed from INNER_PATH_START_INDEX (L-CB7)
export const MIDDLE_RING_START_INDEX = 24; // alias for readability; the hit-before gate fires here
export const INNER_RING_START_INDEX = 40; // the true innermost 3x3 ring
export const FINISH_INDEX = 48;
```

Rotation helpers:

```ts
export function rotate90Clockwise([r, c]: Coord): Coord {
  return [c, 6 - r];
}

export function rotate180(coord: Coord): Coord {
  return rotate90Clockwise(rotate90Clockwise(coord));
}

export function rotate270Clockwise(coord: Coord): Coord {
  return rotate90Clockwise(rotate180(coord));
}

export const PATHS: Record<PlayerSide, readonly Coord[]> = {
  south: SOUTH_PATH,
  west: SOUTH_PATH.map(rotate90Clockwise),
  north: SOUTH_PATH.map(rotate180),
  east: SOUTH_PATH.map(rotate270Clockwise),
};
```

Path invariants:

```text
1. Every player path has length 49.
2. Path index 0 is that player's start house.
3. Path index 48 is the center [3,3].
4. No path contains duplicate coordinates.
5. Every coordinate in each path is inside the 7×7 board.
```

---

# Features

> Each feature includes Functional Requirements (FR), Acceptance Criteria (AC), and a Definition of Done (DoD). Feature DoDs roll up into the global Definition of Done.

## CB1 — Board, path, and rule configuration

**Description.** Define the 7×7 board, player sides, safe houses, canonical path, rotated paths, and immutable game configuration.

### Functional Requirements

- **CB1-FR1.** The board is exactly 7×7, addressed with zero-based `[row, col]` coordinates.
- **CB1-FR2.** The center finish house is `[3,3]`.
- **CB1-FR3.** Player start houses are South `[6,3]`, East `[3,6]`, North `[0,3]`, and West `[3,0]`.
- **CB1-FR4.** Safe houses are the four start houses plus center by default.
- **CB1-FR5.** `SOUTH_PATH` is the canonical path and contains exactly 49 unique coordinates.
- **CB1-FR6.** East, North, and West paths are generated by rotating `SOUTH_PATH`; no hand-maintained duplicate path tables.
- **CB1-FR7.** `GameConfig` is immutable once a game starts.
- **CB1-FR8.** `allowStacking` and `allowGatti` are hardcoded false for v0.1 default mode.

### Acceptance Criteria

- **CB1-AC1.** Given the default config, when paths are generated, then every path has length 49, starts at the correct start house, and ends at `[3,3]`.
- **CB1-AC2.** Given all path coordinates, when validated, then every coordinate is inside the 7×7 board and no path has duplicates.
- **CB1-AC3.** Given a started game, when a client tries to change config, then the command is rejected.
- **CB1-AC4.** Given the v0.1 config, when inspected, then `allowStacking === false` and `allowGatti === false`.

### Definition of Done

- [ ] Board constants, safe houses, path generation, and config are implemented.
- [ ] Path rotation tests pass for all four sides.
- [ ] Config mutation after game start is rejected.
- [ ] README documents the default 7×7 board and rule decisions.

---

## CB2 — Six-cowrie scoring and bonus turns

**Description.** Implement six-cowrie roll generation, scoring, bonus detection, and turn-chain tracking.

### Functional Requirements

- **CB2-FR1.** Every roll contains exactly six cowries.
- **CB2-FR2.** A cowrie face is either `open` or `closed`.
- **CB2-FR3.** Score equals the number of open cowries for open counts 1–6.
- **CB2-FR4.** Score is 12 when zero cowries are open.
- **CB2-FR5.** Roll value 6 is called Chowka and grants a bonus turn.
- **CB2-FR6.** Roll value 12 is called Bhara/Bara and grants a bonus turn.
- **CB2-FR7.** Rolls 1, 2, 3, 4, and 5 do not grant a cowrie-based bonus turn.
- **CB2-FR8.** Hit-based bonus turns are handled by CB3, but turn advancement must combine roll bonus and hit bonus.
- **CB2-FR9.** Cowrie randomness is abstracted behind a `CowrieRandomSource` interface so tests can inject deterministic rolls.

### Acceptance Criteria

- **CB2-AC1.** Given six open cowries, when scored, then the roll value is 6 and `grantsBonusTurn === true`.
- **CB2-AC2.** Given six closed cowries, when scored, then the roll value is 12 and `grantsBonusTurn === true`.
- **CB2-AC3.** Given exactly one open cowrie, when scored, then the roll value is 1 and entry moves may be generated.
- **CB2-AC4.** Given a roll array with length other than 6, when scored, then the scorer throws or returns a validation error.
- **CB2-AC5.** Given deterministic cowrie input, when the reducer applies `ROLL`, then all clients derive the same roll value.

### Definition of Done

- [ ] Cowrie scoring implemented with exhaustive tests for 0–6 open cowries.
- [ ] Bonus-turn detection implemented and tested.
- [ ] Random source abstraction added.
- [ ] UI displays cowrie faces, roll value, and name for 6/12.

---

## CB3 — Pawn lifecycle, occupancy, hit, and finish rules

**Description.** Implement pawn states, board entry, movement, strict no-stacking, hits, safe-house blocking, exact finish, and winner detection.

### Functional Requirements

- **CB3-FR1.** A pawn has one of three states: `home`, `active`, or `finished`.
- **CB3-FR2.** A `home` pawn does not occupy a board house.
- **CB3-FR3.** A pawn may enter the board only when the current roll is 1.
- **CB3-FR4.** A pawn entering the board is placed at its player's start house, path index 0.
- **CB3-FR5.** A pawn may not enter if the player's own active pawn already occupies the start house.
- **CB3-FR6.** A pawn may not enter if an opponent pawn occupies the start house and the start house is safe.
- **CB3-FR7.** An active pawn moves exactly `rollValue` path indices forward.
- **CB3-FR8.** A pawn may not move beyond the center; exact roll is required to finish.
- **CB3-FR9.** If the target house contains the moving player's own pawn, the move is illegal.
- **CB3-FR10.** If the target house contains an opponent pawn on a non-safe house, that opponent pawn is hit and sent home.
- **CB3-FR11.** If the target house contains an opponent pawn on a safe house, the move is illegal.
- **CB3-FR12.** A hit sets `player.hasHit = true` and grants a bonus turn.
- **CB3-FR13.** A player must have `hasHit === true` before any pawn can cross from the outer ring into the inner path.
- **CB3-FR14.** The `hasHit` condition is player-wide, not pawn-specific.
- **CB3-FR15.** A pawn reaching `[3,3]` exactly becomes `finished` and no longer occupies a capturable board house.
- **CB3-FR16.** A player wins when all their pawns are `finished`.

### Acceptance Criteria

- **CB3-AC1.** Given a home pawn and roll 1, when the start house is empty, then an entry move is legal.
- **CB3-AC2.** Given a home pawn and roll 2, when legal moves are generated, then no entry move is generated.
- **CB3-AC3.** Given an own pawn on the target house, when legal moves are generated, then the move is absent.
- **CB3-AC4.** Given an opponent pawn on a non-safe target house, when the move is applied, then the opponent pawn becomes `home`, the moving pawn occupies the target, and the moving player receives a bonus turn.
- **CB3-AC5.** Given an opponent pawn on a safe target house, when legal moves are generated, then the move is absent.
- **CB3-AC6.** Given a pawn one step short of center and roll 1, when moved, then it becomes `finished`.
- **CB3-AC7.** Given a pawn one step short of center and roll 2, when legal moves are generated, then the pawn has no finish move.
- **CB3-AC8.** Given a player with `hasHit === false`, when a pawn would cross into the inner path, then the move is illegal.
- **CB3-AC9.** Given a player with `hasHit === true`, when a pawn would cross into the inner path, then the move may be legal if all other constraints pass.
- **CB3-AC10.** Given all pawns for a player are finished, when the reducer checks the game, then that player is the winner and the game status becomes `finished`.

### Definition of Done

- [ ] Pawn state transitions implemented and tested.
- [ ] No-stacking rule enforced for own and opponent pawns.
- [ ] Hit resolution implemented and tested.
- [ ] Safe-house blocking implemented and tested.
- [ ] Hit-before-inner-path implemented and tested.
- [ ] Exact finish and winner detection implemented and tested.

---

## CB4 — Turn reducer and command model

**Description.** Implement the authoritative local reducer that validates commands, applies legal transitions, records history, and advances turns.

### Functional Requirements

- **CB4-FR1.** All state transitions happen through `applyCommand(state, command)`.
- **CB4-FR2.** The reducer rejects commands from non-current players during active play.
- **CB4-FR3.** A player must roll before selecting a move.
- **CB4-FR4.** A player may select only a move from the current `legalMoves` list.
- **CB4-FR5.** If a roll produces no legal moves, the reducer resolves the turn automatically according to bonus rules.
- **CB4-FR6.** If the roll grants a bonus or the move hits an opponent, the same player remains current after the move unless the game has ended.
- **CB4-FR7.** If no bonus applies, the current player advances to the next non-resigned player in `playerOrder`.
- **CB4-FR8.** The reducer records a compact event history for roll, move, hit, finish, skip, win, join, leave, and resign.
- **CB4-FR9.** Commands include `expectedRevision`; stale commands are rejected by transport transactions.
- **CB4-FR10.** Commands include `commandId`; duplicate commands are idempotently ignored.

### Acceptance Criteria

- **CB4-AC1.** Given a non-current player submits `ROLL`, when applied, then the command is rejected.
- **CB4-AC2.** Given the current player submits `SELECT_MOVE` before rolling, when applied, then the command is rejected.
- **CB4-AC3.** Given a selected move not present in `legalMoves`, when applied, then the command is rejected.
- **CB4-AC4.** Given a non-bonus roll and legal move with no hit, when applied, then the turn advances to the next player.
- **CB4-AC5.** Given roll 6 or 12, when move/skip resolves, then the same player remains current.
- **CB4-AC6.** Given a hit on roll 3, when move resolves, then the same player remains current because hit grants bonus.
- **CB4-AC7.** Given a duplicate command ID, when replayed, then state is unchanged.
- **CB4-AC8.** Given a stale expected revision, when submitted through the transport, then the transaction fails without mutation.

### Definition of Done

- [ ] Reducer implemented as a pure function.
- [ ] Command validation implemented and covered by tests.
- [ ] Turn advancement tested for roll bonus, hit bonus, no legal moves, and win.
- [ ] Event history implemented with bounded retention.

---

## CB5 — Online room and realtime transport

**Description.** Provide online-only multiplayer through a replaceable realtime transport while keeping the rules engine backend-agnostic.

### Functional Requirements

- **CB5-FR1.** A room has a unique `gameId` suitable for a shareable URL.
- **CB5-FR2.** A room starts in `lobby` status.
- **CB5-FR3.** A room may start only with 2–4 seated players.
- **CB5-FR4.** A room may not exceed 4 active player seats.
- **CB5-FR5.** Player sides are assigned deterministically at game start.
- **CB5-FR6.** The host may start the game; non-host start attempts are rejected.
- **CB5-FR7.** `GameTransport` must support state subscription, transactional command submission, and presence updates.
- **CB5-FR8.** The transport must prevent lost updates by using revision checks or backend transactions.
- **CB5-FR9.** A player token stored in local browser storage is required to reclaim a seat after reconnect.
- **CB5-FR10.** Spectators may subscribe to state but cannot submit gameplay commands.

### Acceptance Criteria

- **CB5-AC1.** Given one player in lobby, when start is requested, then the request is rejected.
- **CB5-AC2.** Given two players in lobby, when the host starts, then sides are South and North.
- **CB5-AC3.** Given three players in lobby, when the host starts, then sides are South, East, and North.
- **CB5-AC4.** Given four players in lobby, when the host starts, then sides are South, East, North, and West.
- **CB5-AC5.** Given a fifth join request, when four seats are occupied, then the user becomes spectator or is rejected according to room setting.
- **CB5-AC6.** Given two clients submit conflicting commands at the same revision, when transport transactions run, then only one command mutates state.
- **CB5-AC7.** Given a disconnected player reloads with the same token, when joining, then their seat is restored.

### Definition of Done

- [ ] `GameTransport` interface implemented.
- [ ] At least one production adapter implemented, preferably Firebase or Supabase.
- [ ] Lobby, room creation, join, start, reconnect, and spectator flows implemented.
- [ ] Revision/transaction behavior tested with concurrent command simulation.

---

## CB6 — UI, board rendering, and accessibility

**Description.** Build a clear, responsive UI for the 7×7 board, cowrie rolls, legal move highlighting, player panels, and event history.

### Functional Requirements

- **CB6-FR1.** The board renders as a 7×7 grid with visible safe houses, start houses, and center.
- **CB6-FR2.** The current player's turn is visually prominent.
- **CB6-FR3.** Cowrie faces are displayed after each roll.
- **CB6-FR4.** Legal moves are highlighted after a roll.
- **CB6-FR5.** Illegal moves are not clickable.
- **CB6-FR6.** A pawn's destination preview is shown before confirming a move on desktop hover and mobile tap.
- **CB6-FR7.** Hit events are visually announced and recorded in history.
- **CB6-FR8.** The UI clearly distinguishes home pawns, active pawns, and finished pawns.
- **CB6-FR9.** The UI is responsive for desktop, tablet, and phone.
- **CB6-FR10.** Core controls are keyboard accessible.
- **CB6-FR11.** The board exposes accessible labels for screen readers.
- **CB6-FR12.** The game explains why a player has no legal moves when skipped.

### Acceptance Criteria

- **CB6-AC1.** Given a current roll, when legal moves exist, then only legal pawns/destinations are interactive.
- **CB6-AC2.** Given a blocked safe house, when a player attempts to inspect it, then the UI explains that the pawn is protected and stacking is not allowed.
- **CB6-AC3.** Given a hit, when the move resolves, then the opponent pawn returns to home visually and the event history records the hit.
- **CB6-AC4.** Given a small phone viewport, when the game renders, then the board remains playable without horizontal scrolling.
- **CB6-AC5.** Given keyboard-only navigation, when tabbing through controls, then Roll, legal pawn selection, confirm, and cancel are reachable.

### Definition of Done

- [ ] Board, player panels, cowrie component, move picker, and history are implemented.
- [ ] Legal move highlighting uses reducer output only.
- [ ] Responsive layout verified on desktop and mobile widths.
- [ ] Accessibility labels and keyboard navigation implemented.

---

## CB7 — Persistence, deployment, and release pipeline

**Description.** Build and deploy the app as a GitHub Pages static site, with environment-specific transport configuration and CI validation.

### Functional Requirements

- **CB7-FR1.** The app builds with Vite to static assets.
- **CB7-FR2.** The app supports GitHub Pages base path configuration.
- **CB7-FR3.** Runtime transport configuration is provided by environment variables at build time or by a checked-in public config file for non-secret values.
- **CB7-FR4.** No private backend keys are embedded in the frontend.
- **CB7-FR5.** GitHub Actions builds, tests, and deploys to GitHub Pages.
- **CB7-FR6.** Pull requests run type-check, lint, unit tests, and build.
- **CB7-FR7.** Releases include a changelog and rule-version note.

### Acceptance Criteria

- **CB7-AC1.** Given `npm run build`, when run, then `dist/` contains static files only.
- **CB7-AC2.** Given deployment to GitHub Pages, when the app is opened, then routing works under the repository base path.
- **CB7-AC3.** Given CI, when a pull request is opened, then type-check, lint, tests, and build run.
- **CB7-AC4.** Given the built artifact, when inspected, then it contains no private service-role secret or admin key.

### Definition of Done

- [ ] Vite build configured for GitHub Pages.
- [ ] CI workflow added.
- [ ] GitHub Pages deployment workflow added.
- [ ] Public/private configuration boundaries documented.

---

## CB8 — Rule documentation, variants, and future compatibility

**Description.** Document the exact rule set and make future variants possible without destabilizing the default mode.

### Functional Requirements

- **CB8-FR1.** The README contains a concise rules section matching this spec.
- **CB8-FR2.** The app includes an in-game Rules panel.
- **CB8-FR3.** Rules panel explicitly states: 6 cowries, entry on 1, no stacking, no Gatti, hit sends pawn home.
- **CB8-FR4.** The default mode is versioned as `ruleset: "7x7-six-cowrie-v1"`.
- **CB8-FR5.** Future variants may be added only by creating a new ruleset version.
- **CB8-FR6.** Existing in-progress games must retain their original ruleset version.
- **CB8-FR7.** Public sources and project-specific deviations are documented in the Sources section.

### Acceptance Criteria

- **CB8-AC1.** Given a user opens the Rules panel, then the project's corrected rules are visible without reading the source code.
- **CB8-AC2.** Given a new future variant is added, when a game starts, then the room stores the selected ruleset version.
- **CB8-AC3.** Given an old game state is loaded, when the latest app version runs, then it uses the stored ruleset and not the latest default implicitly.

### Definition of Done

- [ ] README rules section written.
- [ ] In-game Rules panel implemented.
- [ ] Ruleset version stored in every game.
- [ ] Sources and deviations documented.

---

## Invariants

- **I-CB1.** Domain/rules code has no dependency on React, DOM APIs, browser storage, or realtime backend SDKs.
- **I-CB2.** Only the reducer can mutate game state. UI and transport code do not duplicate rule enforcement.
- **I-CB3.** Every active pawn occupies exactly one board coordinate derived from its side's path and `pathIndex`.
- **I-CB4.** No two active pawns occupy the same board coordinate at the end of any valid move.
- **I-CB5.** Home pawns do not occupy board coordinates.
- **I-CB6.** Finished pawns are not capturable and do not block board houses except as part of finished display.
- **I-CB7.** A pawn can enter the board only on roll 1.
- **I-CB8.** Roll values are exactly 1, 2, 3, 4, 5, 6, and 12.
- **I-CB9.** Roll values 6 and 12 grant cowrie-based bonus turns.
- **I-CB10.** A hit grants a bonus turn and sets `player.hasHit = true`.
- **I-CB11.** A pawn cannot enter the inner path unless its player has hit at least one opponent pawn.
- **I-CB12.** A pawn must land exactly on the center to finish.
- **I-CB13.** Safe houses protect occupants from hits; because stacking is forbidden, occupied safe houses are blocked.
- **I-CB14.** No Gatti, double, blockade, stack protection, or pair movement exists in the default ruleset.
- **I-CB15.** The game status becomes `finished` immediately when a winner is detected.
- **I-CB16.** Replaying the same command ID never applies the command twice.
- **I-CB17.** Stale revision commands do not mutate state.
- **I-CB18.** Occupancy is determined by each active pawn's resolved board `Coord` (`PATHS[side][pathIndex]`), never by `pathIndex` alone (L-CB1). All hit/block/no-stacking checks read one `Coord`-keyed occupancy map.
- **I-CB19.** When `legalMoves` is non-empty the current player must select one; there is no voluntary pass. A turn is auto-resolved only when zero legal moves exist (L-CB10).

---

## Edge Cases

- **Roll 1 while all home pawns are blocked from entry.** Active pawns may still move by 1 if legal. If no active pawn can move, the player has no legal move.
- **Roll 1 with both entry and active moves available.** The player may choose either entering a home pawn or moving an active pawn by 1.
- **Own pawn on start house.** A home pawn cannot enter because stacking is forbidden.
- **Opponent pawn on own start house.** If the start house is safe, entry is blocked. If a future ruleset marks start houses unsafe, entry may hit according to that ruleset.
- **Opponent pawn on safe house.** The target is blocked; no hit and no shared occupancy.
- **Opponent pawn on non-safe house.** The move is legal and must hit; the opponent pawn is sent home.
- **Move crosses into inner path without prior hit.** The move is illegal. If no other move exists, the player loses/ends that roll.
- **Exact finish overshoot.** A pawn near center cannot move if the roll overshoots finish.
- **No legal moves after bonus roll.** If the roll itself was 6 or 12, the player receives another roll unless `tripleBonusRule` later says otherwise. With `tripleBonusRule: disabled`, this can continue.
- **All other players resigned.** The remaining non-resigned player wins.
- **Disconnected current player.** v0.1 does not auto-play. A room-level inactivity timer may allow host/admin abandon or skip in a later version.
- **Simultaneous command submission.** The transport transaction accepts only one command for the expected revision.
- **Client clock skew.** Timestamps are informational only. Turn legality never depends on client wall-clock time in v0.1.
- **Reload during selected move.** Since state stores `currentRoll` and `legalMoves`, the player can resume move selection after reconnect.

---

## Security and Fair Play

- **No secrets in frontend.** GitHub Pages assets must not contain private keys, admin tokens, service-role keys, or privileged backend credentials.
- **Room-local identity only.** Player identity is a display name plus local reclaim token. No account system in v0.1.
- **Transaction-guarded commands.** Every command includes `expectedRevision`; stale commands fail.
- **Idempotent commands.** Every command includes `commandId`; duplicate commands are ignored.
- **Reducer validation.** Transport adapters must call the same reducer to validate commands before committing state.
- **No gambling support.** No wagers, payments, rewards, rankings, or prizes.
- **Client-side randomness caveat.** v0.1 uses client-generated cowrie randomness. This is acceptable for friendly rooms but not adversarial play.
- **Future fair-roll mode.** A later version may implement commit-reveal randomness or authoritative server-generated rolls.
- **Minimal stored data.** Store only room state, display names, local tokens, and event history needed to run/reconnect games.
- **Abuse controls.** Public deployments should support room expiry and optional manual room deletion to avoid unbounded backend growth.

---

## Non-Functional Requirements

- **Performance.** Legal move generation for a 4-player game with 4 or 6 pawns each must complete in under 5 ms on a typical laptop browser.
- **Reliability.** Reconnect should restore a player's room state without manual support if local token is present.
- **Maintainability.** No source file should exceed 500 lines without an explicit exception.
- **Type safety.** TypeScript strict mode enabled.
- **Test coverage.** Domain + application + transport logic: **≥ 97%** (statements/branches/functions/lines), enforced in CI via Vitest thresholds (L-CB8). UI component coverage is best-effort and measured separately.
- **Accessibility.** Core game actions must be usable by keyboard. Visual-only feedback must have textual equivalent.
- **Responsive design.** Playable on desktop and mobile browser widths.
- **Bundle size.** Initial JS bundle should remain small enough for fast GitHub Pages loads; target under 300 KB gzipped for v0.1 if feasible.
- **Browser support.** Latest stable Chrome, Edge, Firefox, and Safari desktop browsers; mobile browser support best-effort.
- **Observability.** Console logging in development only; production logging must not leak room tokens.

---

## Constraints

- **GitHub Pages is static.** No server-side Node/Python/Ruby/PHP code can run on GitHub Pages.
- **Realtime backend required.** Online-only multiplayer requires Firebase, Supabase, PartyKit, WebRTC signaling, or similar external infrastructure.
- **Rules are stricter than some public variants.** No stacking and no Gatti are project decisions even if some variants allow doubles.
- **Six cowries are mandatory.** Four-cowrie variants are out of scope for v0.1.
- **Entry roll is 1 only.** Chowka/Bhara do not enter pawns in this ruleset.
- **No authoritative anti-cheat in v0.1.** Friendly-room play only.
- **No mutable rules after start.** A game's config/ruleset is locked when the game begins.
- **Transport must support transactional writes.** A plain last-write-wins document store without transaction/revision checks is insufficient.

---

## File / Module Impact

| Path | Change |
|---|---|
| `src/domain/types.ts` | Core types: `Coord`, `PlayerSide`, `Pawn`, `GameState`, `GameConfig`, `LegalMove`, `GameCommand` |
| `src/domain/board.ts` | Board constants, safe houses, start houses, path rotation helpers |
| `src/domain/paths.ts` | `SOUTH_PATH`, `PATHS`, path validation |
| `src/domain/cowries.ts` | Cowrie scoring, random source interface, bonus detection |
| `src/domain/legal-moves.ts` | Legal move generation for entry, movement, hit, safe-house blocking, finish |
| `src/domain/reducer.ts` | Pure command reducer and state transition logic |
| `src/domain/invariants.ts` | Runtime invariant assertions for dev/test |
| `src/domain/history.ts` | Game event creation and bounded history retention |
| `src/app/services/game-service.ts` | Application-level command helpers and UI-facing orchestration |
| `src/transport/game-transport.ts` | `GameTransport` port |
| `src/transport/firebase-transport.ts` | Firebase adapter, if Firebase is selected |
| `src/transport/supabase-transport.ts` | Supabase adapter, if Supabase is selected |
| `src/components/Board.tsx` | 7×7 board rendering |
| `src/components/House.tsx` | Single house rendering, safe/start/center states |
| `src/components/Pawn.tsx` | Pawn rendering |
| `src/components/CowrieRoll.tsx` | Six-cowrie display and roll result |
| `src/components/PlayerPanel.tsx` | Player status, home pawns, finished pawns |
| `src/components/GameHistory.tsx` | Roll/move/hit/finish/win event log |
| `src/pages/HomePage.tsx` | Create/join room UI |
| `src/pages/GamePage.tsx` | Game room UI |
| `src/routes.tsx` | Static-router compatible GitHub Pages routing |
| `src/config/public-config.ts` | Public transport config, no secrets |
| `tests/domain/*.test.ts` | Rules engine unit tests |
| `tests/integration/*.test.ts` | Reducer + transport integration tests |
| `.github/workflows/ci.yml` | Type-check, lint, test, build |
| `.github/workflows/pages.yml` | Deploy static app to GitHub Pages |
| `README.md` | Game overview, rules, setup, deployment |
| `spec/SPEC-CHOWKA-BHARA-ONLINE.md` | This spec |

---

## Required Tests

### Unit tests

- **Cowrie scoring:** 0 open → 12; 1 open → 1; 2 open → 2; 3 open → 3; 4 open → 4; 5 open → 5; 6 open → 6.
- **Bonus detection:** 6 and 12 grant bonus; 1–5 do not.
- **Path validation:** all paths length 49, no duplicates, valid coordinates, correct starts, center finish.
- **Entry:** home pawn can enter only on roll 1.
- **Entry blocked by own pawn:** entry illegal if own active pawn occupies start.
- **Entry blocked by safe opponent:** entry illegal if opponent occupies protected start house.
- **Movement:** active pawn moves exactly roll value.
- **Own target blocked:** move illegal if target has own pawn.
- **Opponent unsafe hit:** move legal; opponent sent home; player `hasHit = true`; bonus granted.
- **Opponent safe blocked:** move illegal; no hit.
- **Inner path gate:** crossing into inner path illegal before hit; legal after hit.
- **Exact finish:** exact roll finishes; overshoot illegal.
- **Winner:** all pawns finished produces winner.
- **Reducer command validation:** wrong player, stale phase, invalid move, duplicate command.
- **Turn advancement:** no bonus, roll bonus, hit bonus, no legal moves.

### Integration tests

- **Two-player full mini-game:** deterministic sequence reaches a winner.
- **Reconnect flow:** player token reclaims seat.
- **Concurrent command conflict:** only one command applies at a revision.
- **Transport serialization:** persisted state round-trips without losing readonly/enum semantics.
- **GitHub Pages routing:** room URL loads correctly under repository base path.

### Manual tests

- Create a 2-player room and complete a game.
- Create a 3-player room and verify turn order.
- Create a 4-player room and verify side assignment.
- Confirm roll 1 entry works and roll 2 entry does not.
- Confirm no two pawns can occupy the same house.
- Confirm opponent hit sends pawn home.
- Confirm safe occupied house blocks landing.
- Confirm player cannot enter inner path before hit.
- Confirm exact center finish.
- Confirm reconnect after browser refresh.
- Confirm deployment works from GitHub Pages URL.

---

## Definition of Done — v0.1 playable release

- [ ] All feature DoDs CB1–CB8 complete.
- [ ] Default ruleset `7x7-six-cowrie-v1` implemented exactly as this spec defines.
- [ ] Six-cowrie scoring implemented and tested.
- [ ] Entry only on 1 implemented and tested.
- [ ] No-stacking rule implemented and tested.
- [ ] No Gatti/double/blockade logic exists in v0.1 code path.
- [ ] Hit on opponent landing implemented and tested.
- [ ] Safe-house blocking implemented and tested.
- [ ] Hit-before-inner-path implemented and tested.
- [ ] Exact center finish implemented and tested.
- [ ] 2–4 player online rooms implemented.
- [ ] Realtime transport adapter implemented with transactional command application.
- [ ] Reconnect using local player token implemented.
- [ ] React UI supports board, cowries, player panels, legal move highlighting, and event history.
- [ ] Rules panel and README accurately document the rules.
- [ ] TypeScript strict build passes.
- [ ] Lint passes.
- [ ] Unit and integration tests pass.
- [ ] GitHub Pages deployment works.
- [ ] No secrets are embedded in the built frontend.
- [ ] Manual full-game test completed with at least 2 players in separate browsers.

---

## Risks & Open Questions

- **R-CB1: Regional rule disagreement.** Public rules differ on pawn count, cowrie count, entry, stacking, doubles, and bonuses. Mitigation: this spec declares one project-specific ruleset and documents deviations.
- **R-CB2: Safe-house interpretation.** Some variants allow multiple pawns on safe houses. This implementation forbids all stacking, so occupied safe houses are blocked. Mitigation: test and document clearly.
- **R-CB3: Client-generated randomness.** Friendly rooms can trust local randomness, but adversarial users could tamper. Mitigation: future commit-reveal or authoritative roll service.
- **R-CB4: GitHub Pages limitation.** Static hosting cannot provide realtime state by itself. Mitigation: transport adapter and external backend.
- **R-CB5: Firebase/Supabase rules complexity.** Security rules must prevent unauthorized writes. Mitigation: reducer validation plus transaction/revision checks; document backend rules.
- **R-CB6: Long games.** Four-player games with 4 or 6 pawns may be long. Mitigation: default to 4 pawns; add 6-pawn long mode later.
- **R-CB7: Mobile board usability.** 7×7 board plus panels may feel cramped. Mitigation: responsive layout with collapsible panels.
- **R-CB8: Reconnect token loss.** Clearing local storage loses reclaim token. Mitigation: host can allow seat reclaim by display name in a later admin flow.
- **R-CB9: Rule evolution.** Changing rules could break in-progress games. Mitigation: store `ruleset` with every room.
- **R-CB10: Abuse and stale rooms.** Public backend may accumulate abandoned rooms. Mitigation: room TTL and cleanup job if backend supports it.

---

## Appendix A — Canonical README rules text

```md
## Rules

Chowka Bhara Online uses a 7×7 board and 6 cowries.

Roll values:

| Open cowries | Move value |
|---:|---:|
| 0 | 12, Bhara / Bara |
| 1 | 1 |
| 2 | 2 |
| 3 | 3 |
| 4 | 4 |
| 5 | 5 |
| 6 | 6, Chowka |

A pawn can enter the board only on a roll of 1.

Rolling 6 or 12 gives an extra turn.

Only one pawn may occupy a house. There is no stacking, no Gatti, no double, and no paired movement.

If a pawn lands on an opponent pawn on a non-safe house, the opponent pawn is hit and sent home. The player who hit gets another turn.

A pawn on a safe house cannot be hit. Since stacking is not allowed, an occupied safe house blocks landing.

A player must hit at least one opponent pawn before entering the inner path.

A pawn must land exactly on the center house to finish.

The first player to move all pawns to the center wins.
```

---

## Appendix B — Future variants, explicitly out of v0.1

Future rulesets may add:

- 6 pawns per player.
- Alternate safe-house layouts.
- Triple-bonus penalty.
- Team mode.
- Four-cowrie regional variant.
- Stacking/double/Gatti variant, if intentionally added under a different ruleset.
- Commit-reveal fair-roll mode.
- Bot players.
- Public matchmaking.

Any such change must use a new ruleset id and must not alter `7x7-six-cowrie-v1` behavior.

---

## Sources

- Wikipedia, **Chowka bhara** — useful for general play structure, fixed path, hit requirement before inner squares, safe squares, exact center finish, and regional variation notes: https://en.wikipedia.org/wiki/Chowka_bhara
- Roll the Dice, **How to play Chowka Bara (7 House)** — useful for 7-house / 6-cowrie terminology, including Chowka and Baara/Bhara scoring: https://rollthedice.in/pages/how-to-play-chowka-bara-7-house
- It's Not a Video Game, **Chowka Bhara** — useful for hit-before-inner-square and hit-on-landing descriptions: https://itsnotvideogame.wordpress.com/2015/04/13/chowka-bhara/
- Kreedaa Kaushalya, **Traditional Board Games of India: Chauka Bara** — useful for outer/inner path movement description: https://kreedaakaushalya.blogspot.com/2008/05/chauka-bara.html
- User-provided corrections for this implementation: 6 cowries, entry only on 1, no Gatti, no stacking, landing on opponent pawn sends opponent home.
