# Chowka Bhara Online — UI / UX Design (CB6)

## Metadata

- **Status:** Draft for review
- **Owner:** UI/UX Designer
- **Scope:** Feature CB6 (UI, board rendering, accessibility) plus the component contracts for the whole app shell
- **Authoritative data model:** `spec/SPEC-CHOWKA-BHARA-ONLINE.md` — `GameState`, `LegalMove`, `CowrieRoll`, `Pawn`, `Player`, `GameCommand`, `GameConfig`, `PATHS`
- **Branch:** `feat/chowka-bhara-online`

### Contract reconciliation note

This design is written directly against the interfaces declared in the spec
(`GameState`, `LegalMove`, `CowrieRoll`, `Pawn`, `Player`, `GameConfig`, `GameCommand`,
the `PATHS` table, and `START_HOUSES` / `SAFE_HOUSES`). Those interfaces are the
authoritative component-facing contract for the UI. If the architect publishes a
contract that diverges from the spec (renamed fields, an extra selector layer, a
different command-dispatch signature, or additional derived state), reconcile by:

1. Treating the architect's exported TypeScript types as the source of truth for **shape**.
2. Keeping this document's **prop/event semantics** unchanged unless the divergence is material.
3. Folding any UI-only state the components need (see "UI-driven SPEC requests" at the end)
   into either the architect's view-model layer or a thin UI store — never duplicating rule
   logic in components (invariant **I-CB2**: only the reducer mutates game state and UI must
   not re-derive legality).

The UI is a **pure projection** of reducer output. Components receive data and emit intent
(`GameCommand` requests); they never compute legality, never mutate `GameState`, and never
re-implement path math.

---

## 1. Design principles for this UI

- **Reducer is the single source of truth.** Highlighting, interactivity, and skip
  explanations are derived only from `state.legalMoves`, `state.currentRoll`,
  `state.currentPlayerId`, and `state.pawns`. (CB6-FR4, CB6-FR5, DoD: "Legal move
  highlighting uses reducer output only.")
- **Illegal is non-interactive, not merely styled.** A cell with no matching `LegalMove`
  has no click handler, `tabindex="-1"`, `aria-disabled` where relevant, and no pointer
  affordance. (CB6-FR5, CB6-AC1)
- **Every visual signal has a text equivalent.** Color, glow, and animation are
  reinforcement, never the sole carrier of meaning. (NFR Accessibility, CB6-FR11, CB6-FR12)
- **The board never assumes step-1 grid adjacency.** Connectors and movement previews are
  driven by `PATHS[side]` index order, not by neighbouring grid cells. (See §8.)
- **Cultural respect over generic polish.** Warm, earthy, hand-drawn-grid aesthetic evoking
  a cloth/chalk Chowka Bara board — not a neon "AI dashboard." (See §9.)

---

## 2. Component tree

```
App
├── RouterOutlet
│   ├── HomePage                         (route: "/")
│   │   ├── CreateRoomCard
│   │   ├── JoinRoomCard
│   │   └── RulesPanel (modal/drawer trigger, shared)
│   └── GamePage                         (route: "/room/:gameId")
│       ├── LobbyView        (when state.status === "lobby")
│       │   ├── SeatList
│       │   ├── ShareLink
│       │   └── StartGameButton (host only)
│       ├── PlayView         (when state.status === "playing" | "finished")
│       │   ├── BoardArea
│       │   │   └── Board                (7×7 grid)
│       │   │       └── House × 49       (safe / start / center / normal)
│       │   │           └── Pawn × n     (home / active / finished)
│       │   ├── ControlRail
│       │   │   ├── CowrieRoll           (6 cowries + value + Chowka/Bhara label)
│       │   │   ├── MovePicker           (legal-move list + confirm/cancel)
│       │   │   └── TurnBanner           (whose turn / bonus / skip reason)
│       │   ├── SidePanels  (collapsible)
│       │   │   ├── PlayerPanel × n      (one per seat)
│       │   │   ├── GameHistory
│       │   │   └── RulesPanel
│       │   └── WinnerOverlay (when state.status === "finished")
│       └── SpectatorBadge  (when local viewer holds no seat)
└── ToastRegion (Toasts)                 (app-level, portal)
```

`MovePicker` is the interaction coordinator. It owns the **local-only** selection state
(`selectedMoveId`, `hoveredMoveId`) and renders highlight/preview decisions onto `Board`
via props. It never holds game truth — it only references `LegalMove.id` values from
`state.legalMoves`.

---

## 3. Per-component contract (props in / events out)

Notation: `props ↓` are inputs; `events ↑` are intents the component emits upward. Intents
ending in `Command` are requests to dispatch a `GameCommand` through the app/transport layer
(the parent wires them to `transactCommand`). All game data shapes are the spec's exported
types.

### App

```
props ↓
  (none — top-level; owns router + transport subscription + toast registry)
events ↑
  (none)
responsibilities
  - Subscribe via GameTransport.subscribeRoom; hold latest GameState in a store.
  - Provide { state, localPlayerId, isSpectator, dispatch(command) } via context.
  - Mount ToastRegion and global RulesPanel portal root.
```

### HomePage

```
props ↓
  recentRoomId?: string                 // from local storage, optional resume hint
events ↑
  onCreateRoom(input: { displayName: string; ruleset: "7x7-six-cowrie-v1" })
                                         // → CreateRoomCommand path
  onJoinRoom(input: { gameId: string; displayName: string })
                                         // → JoinRoomCommand path
notes
  - Validates display name non-empty at the boundary (NFR: validate at boundaries).
  - On success the app navigates to /room/:gameId.
```

### GamePage

```
props ↓
  gameId: string                        // from route param
  state: GameState
  localPlayerId: string | null
  isSpectator: boolean
events ↑
  onCommand(command: GameCommand)       // single funnel to transport.transactCommand
derived (read-only, computed in a selector, NOT in children)
  currentPlayer   = state.players[state.currentPlayerId]
  isMyTurn        = localPlayerId === state.currentPlayerId && !isSpectator
  myPawns         = pawns filtered by playerId === localPlayerId
notes
  - Chooses LobbyView vs PlayView from state.status.
  - Passes `isMyTurn` down so children gate interactivity without recomputing turn rules.
```

### LobbyView (sub-views)

```
SeatList
  props ↓ players: Record<string,Player>; playerOrder: string[]; localPlayerId; hostId
  events ↑ (none; display)
ShareLink
  props ↓ gameId: string
  events ↑ onCopy()                      // copies room URL; emits a Toast on success
StartGameButton
  props ↓ canStart: boolean             // host && 2..4 seated (CB5-FR3/FR6)
  events ↑ onStartGame()                 // → StartGameCommand
```

### Board (7×7 grid)

```
props ↓
  config: GameConfig                    // safeHouses, finishIndex (board metadata)
  pawns: Record<string, Pawn>           // all pawns, for occupancy rendering
  players: Record<string, Player>       // for color/side per pawn
  legalMoves: readonly LegalMove[]      // reducer output (the ONLY source of interactivity)
  selectedMoveId: string | null         // local selection from MovePicker
  hoveredMoveId: string | null          // local hover/focus preview
  isMyTurn: boolean
events ↑
  onHouseActivate(coord: Coord)         // click / Enter / Space on a house
  onHouseHoverEnter(coord: Coord)       // hover or keyboard focus → preview
  onHouseHoverLeave(coord: Coord)
responsibilities
  - Render exactly 49 House cells from a fixed [row,col] map.
  - Resolve each pawn's coord from PATHS[player.side][pawn.pathIndex] (active pawns only).
  - Mark a house "interactive" iff some legalMove.to equals that coord AND isMyTurn.
  - Draw the destination preview for the active (hovered/selected) move using PATH order,
    NOT grid adjacency (see §8).
constraints
  - Board MUST NOT compute whether a move is legal. It only matches reducer-provided
    legalMoves[].to against rendered coordinates. (I-CB2, CB6-FR5)
```

### House (safe / start / center / normal states)

```
props ↓
  coord: Coord
  kind: "normal" | "safe" | "start" | "center"   // derived from config.safeHouses & START_HOUSES
  startSide: PlayerSide | null          // tints a start house with its owner color
  occupantPawnId: string | null
  interactive: boolean                  // true only if a legal move targets this house & my turn
  highlight: "none" | "legal" | "preview" | "selected"
  blockedReason: "safe-occupied" | null // for the "why blocked" explanation (CB6-AC2)
events ↑
  onActivate()                          // only fires when interactive === true
  onHoverEnter() / onHoverLeave()
  onInspect()                           // long-press / right-click / focus+key → explain blocked
a11y
  - role="gridcell"
  - aria-label: textual house description (see §6 ARIA table)
  - tabindex: 0 when interactive, otherwise -1 (roving tabindex within the grid)
  - aria-disabled="true" when a blocked safe house is inspected
```

### Pawn (home / active / finished)

```
props ↓
  pawn: Pawn                            // { state, pathIndex, finishedOrder, playerId }
  side: PlayerSide
  color: string                         // player.color
  isMovable: boolean                    // some legalMove.pawnId === pawn.id && isMyTurn
  isSelected: boolean
events ↑
  onSelect()                            // selecting the pawn picks its single/most-likely move
                                        // (or opens MovePicker disambiguation if >1 move)
a11y
  - role="button" when isMovable, else role="img"
  - aria-label: "<side> pawn, <home|on house r,c|finished #order>;
    <movable: can move to r,c | not movable>"  (textual equivalent — CB6-FR8/FR11)
visual states
  - home:    rendered in the owner's PlayerPanel tray, muted/outline fill
  - active:  rendered on its board House, solid fill, side color
  - finished: rendered in a "home stretch / finished" cluster with order badge
```

### CowrieRoll (six cowries + value + Chowka/Bhara label)

```
props ↓
  roll: CowrieRoll | null               // { faces[6], openCount, value, grantsBonusTurn }
  canRoll: boolean                      // isMyTurn && no pending unresolved move
  isRolling: boolean                    // local animation flag
events ↑
  onRoll()                              // → RollCowriesCommand (client generates faces)
display
  - Six cowrie glyphs showing open vs closed faces (faces[i]).
  - Numeric value badge: 1..6 or 12.
  - Label: value===6 → "Chowka"; value===12 → "Bhara"; else open-count caption.
  - grantsBonusTurn === true → "Bonus turn!" text + persistent badge (not color-only).
a11y
  - Roll button is a real <button>, first in the turn tab order (CB6-AC5).
  - aria-live="polite" region announces: "Rolled <value><, Chowka|, Bhara>.
    <Bonus turn.|> <N legal moves.|No legal moves: <reason>.>"
  - Each cowrie has aria-label "cowrie open" / "cowrie closed" (text equivalent of face art).
```

### MovePicker / legal-move highlighting

```
props ↓
  legalMoves: readonly LegalMove[]
  pawns: Record<string, Pawn>
  players: Record<string, Player>
  isMyTurn: boolean
local state (owned here, UI-only)
  selectedMoveId: string | null
  hoveredMoveId: string | null
events ↑
  onSelectionChange(selectedMoveId, hoveredMoveId)
                                        // bubbles to Board for highlight/preview rendering
  onConfirmMove(moveId: string)         // → SelectMoveCommand({ moveId-derived payload })
  onCancel()                            // clears selection
behavior
  - Renders one entry per LegalMove: "Pawn → house (r,c)" with badges:
    "Hit!" if wouldHitPawnId, "Finish!" if wouldFinish, "Enter" if type==="enter".
  - Selecting an entry sets selectedMoveId and highlights the target House on the Board.
  - Confirm dispatches; cancel returns to unselected.
  - When legalMoves is empty after a roll, MovePicker renders nothing; the skip
    explanation is owned by TurnBanner (see §7).
mapping rule (CB6-FR5 / CB6-AC1)
  - Interactive houses  = unique set of legalMoves[*].to.
  - Interactive pawns   = unique set of legalMoves[*].pawnId.
  - Everything else is non-interactive (no handler, tabindex -1).
```

### PlayerPanel

```
props ↓
  player: Player                        // displayName, side, color, status, hasHit
  pawns: Pawn[]                         // this player's pawns
  isCurrent: boolean                    // player.id === state.currentPlayerId
  isLocal: boolean
display
  - Header: display name, side chip (color + side label text), connection status dot
    WITH text ("connected"/"disconnected"/"resigned" — not color only).
  - hasHit indicator: "Inner path unlocked" / "Must hit to enter inner path" (CB3-FR13 UX).
  - Home tray: count + glyphs of home pawns. Finished tray: finished pawns with order.
  - isCurrent → prominent border + "Their turn" / "Your turn" text (CB6-FR2).
events ↑ (none; display only)
```

### GameHistory

```
props ↓
  history: readonly GameEvent[]         // roll/move/hit/finish/skip/win/join/leave/resign
display
  - Reverse-chronological list, each event rendered to a human sentence
    (e.g. "South hit North on (4,6)", "East rolled Chowka", "West skipped: no legal moves").
  - Hit and win events get an icon + text label (CB6-FR7, CB6-AC3).
a11y
  - role="log", aria-live="polite" so new events are announced.
events ↑ (none)
```

### RulesPanel

```
props ↓
  open: boolean
  ruleset: string                       // e.g. "7x7-six-cowrie-v1" (CB8-FR4)
events ↑
  onClose()
content (CB8-FR3)
  - 6 cowries; entry on 1; no stacking; no Gatti; hit sends pawn home;
    safe houses block; hit-before-inner-path; exact center finish.
  - Roll value table (0→12 Bhara … 6 Chowka).
```

### Toasts (ToastRegion)

```
props ↓
  toasts: Toast[]                       // { id, kind: "info"|"success"|"warn"|"error", text }
events ↑
  onDismiss(id)
sources
  - Command rejections (wrong turn, stale revision), copy-link success,
    reconnect restored, opponent hit you, you were skipped.
a11y
  - aria-live="assertive" for error/warn, "polite" for info/success.
```

---

## 4. How `legalMoves[]` maps to interactive cells (CB6-FR5)

The **only** inputs to interactivity are `state.legalMoves` and `isMyTurn`. No component
recomputes legality.

```
Given: legalMoves: LegalMove[], isMyTurn: boolean

interactiveHouseCoords = isMyTurn
    ? new Set(legalMoves.map(m => coordKey(m.to)))
    : new Set()                          // not my turn → board is fully non-interactive

interactivePawnIds = isMyTurn
    ? new Set(legalMoves.map(m => m.pawnId))
    : new Set()

For each rendered House at coord:
    house.interactive = interactiveHouseCoords.has(coordKey(coord))
    if house.interactive:
        tabindex = 0; attach onActivate; show "legal" highlight ring
    else:
        tabindex = -1; NO onActivate handler; NO pointer cursor; no highlight

For each rendered Pawn:
    pawn.isMovable = interactivePawnIds.has(pawn.id)
    movable pawns are role="button" tabbable; others are role="img" non-interactive
```

Selection/confirm flow:

```
1. Player rolls → reducer returns state.currentRoll + state.legalMoves.
2. UI highlights interactive houses/pawns (above).
3. Player selects a pawn OR a destination house:
     - if the chosen target maps to exactly one LegalMove → that move becomes selectedMoveId.
     - if it maps to several (e.g. a pawn with multiple destinations) → MovePicker lists them.
4. Hover/focus on a legal house → preview path to it (§8); selection → "selected" highlight.
5. Confirm → dispatch SelectMoveCommand referencing the chosen LegalMove.
6. Cancel → clear selectedMoveId; highlights revert to plain "legal".
```

Illegal cells are structurally inert: because they carry no click handler and
`tabindex="-1"`, they cannot be reached by mouse intent, Enter/Space, or tab — satisfying
CB6-FR5 and CB6-AC1 at the DOM level, not just visually.

---

## 5. Accessibility plan

### 5.1 Keyboard reachability (CB6-FR10, CB6-AC5)

Tab order during the local player's turn:

```
[Roll button] → [legal Pawn 1] → [legal Pawn 2] … → [MovePicker entries] →
[Confirm] → [Cancel] → [side panels / history]
```

- **Roll** is a native `<button>`, focusable, activates on Enter/Space → `onRoll`.
- **Pawn selection:** only movable pawns are in the tab order (roving tabindex); Enter/Space
  selects. Arrow keys move focus between movable pawns (grid roving) for fast selection.
- **Destination selection:** within the Board grid, arrow keys move a roving focus across
  cells; only interactive cells are stops. Enter/Space on a legal cell selects that move.
- **Confirm / Cancel:** native buttons in the MovePicker, reachable by Tab; `Esc` also
  triggers Cancel anywhere in the turn.
- When it is **not** the local player's turn, the Roll button and all pawns/cells are
  removed from the tab order (`tabindex="-1"`), so a keyboard user is never trapped on
  inert controls.

### 5.2 ARIA labels for houses and pawns (CB6-FR11)

| Element | role | aria-label pattern |
|---|---|---|
| Board | `grid` | "Chowka Bhara board, 7 by 7" |
| House (normal) | `gridcell` | "House row R column C" |
| House (safe) | `gridcell` | "Safe house, row R column C" |
| House (start) | `gridcell` | "<Side> start house, row R column C" |
| House (center) | `gridcell` | "Center finish house, row R column C" |
| House (legal target) | `gridcell` | "… , legal move: <pawn> can move here<, hits opponent><, finishes>" |
| House (blocked safe) | `gridcell` | "… , blocked: opponent pawn is protected; stacking not allowed" |
| Pawn (home) | `img`/`button` | "<Side> pawn at home<, can enter board>" |
| Pawn (active) | `img`/`button` | "<Side> pawn on house R,C<, can move to R2,C2><, can hit><, can finish>" |
| Pawn (finished) | `img` | "<Side> pawn finished, order N" |

### 5.3 Textual equivalents for visual-only feedback

- **Roll outcome:** `aria-live="polite"` region in CowrieRoll announces value, Chowka/Bhara,
  bonus, and legal-move count — no reliance on glyph color/shape alone.
- **Cowrie faces:** each cowrie has "open"/"closed" aria-label (CB6-FR3 visual + text).
- **Hit:** GameHistory (`role="log"`) announces "<side> hit <side> on (R,C)"; a Toast also
  announces it assertively to the hit player (CB6-FR7, CB6-AC3).
- **Turn / current player:** TurnBanner text "Your turn" / "<Name>'s turn" plus the colored
  border (CB6-FR2) — text carries the meaning.
- **Connection status:** dot color is paired with the literal word in PlayerPanel.
- **hasHit / inner-path gate:** explicit text "Inner path unlocked" vs "Hit an opponent to
  unlock the inner path."

### 5.4 "Why no legal moves" explanation (CB6-FR12)

When a roll yields `legalMoves.length === 0`, TurnBanner shows a plain-language reason,
selected from reducer-derivable facts (no rule recomputation — see SPEC request #1):

```
reason cases (rendered as sentences):
  - roll === 1, all home pawns blocked, no active pawn can advance:
      "No legal moves: your start house is blocked and no active pawn can move 1."
  - all candidate destinations occupied by own pawns / protected safe opponents:
      "No legal moves: every reachable house is blocked."
  - inner-path gate (player has not hit, only moves would cross into inner path):
      "No legal moves: you must hit an opponent before entering the inner path."
  - overshoot near center:
      "No legal moves: your pawns would overshoot the center; an exact roll is needed."
  - bonus roll with no moves (6/12): add "You rolled again." since the turn continues.
```

This is announced via `aria-live` and shown visibly, so both sighted and screen-reader
users understand the skip. The reason **string/enum should be supplied by the reducer**
(see UI-driven SPEC requests) so the UI does not re-derive blocking logic and violate I-CB2.

---

## 6. Responsive layout (CB6-FR9, CB6-AC4, R-CB7)

Three breakpoints, board-first, no horizontal scroll on phone.

```
Desktop  ≥ 1024px:  3-column
  ┌───────────┬───────────────────────┬───────────┐
  │ Players   │        Board          │ History   │
  │ (panels)  │   + ControlRail below │ + Rules   │
  └───────────┴───────────────────────┴───────────┘

Tablet   640–1023px:  2-column, side panels collapsible
  ┌───────────────────────┬───────────┐
  │        Board          │ Players ▸ │   (History/Rules in tabs/drawer)
  │     ControlRail       │           │
  └───────────────────────┴───────────┘

Phone    < 640px:  single column, stacked, collapsible drawers
  ┌───────────────────────┐
  │      TurnBanner        │
  │  Board (square, 100vw  │  ← board sized to min(100vw, available height)
  │   minus gutters)       │
  │     CowrieRoll         │
  │     MovePicker         │
  │  [Players] [History]   │  ← collapsed accordions / bottom-sheet tabs
  │  [Rules]               │
  └───────────────────────┘
```

Rules to guarantee no horizontal scroll (CB6-AC4):

- Board is a CSS `aspect-ratio: 1` grid sized `width: min(100%, 92vmin)`; the 7×7 cells use
  `grid-template-columns: repeat(7, 1fr)`, so cells shrink with the viewport — never a fixed
  px width that forces overflow.
- Side panels become **collapsible drawers / accordions** below the `sm` breakpoint; they are
  never laid out beside the board on phone.
- ControlRail (Roll, MovePicker) stacks under the board on phone, full-width.
- Pawn glyphs and labels scale with cell size via `clamp()`; touch targets stay ≥ 44px by
  enlarging the interactive hit area without enlarging the grid.
- `overflow-x: hidden` on the page shell as a backstop; the layout is designed not to need it.

Collapsed panels keep their content reachable (CB6 accessibility): a collapsed PlayerPanel
still exposes the current-player and your-turn state in the always-visible TurnBanner, so
critical turn info is never hidden behind a closed drawer.

---

## 7. TurnBanner (turn state + skip reason)

`TurnBanner` is a small but load-bearing component for both UX and a11y; it centralizes the
"what now / why skipped" messaging so the explanation has one home.

```
props ↓
  currentPlayer: Player | null
  isMyTurn: boolean
  roll: CowrieRoll | null
  legalMoveCount: number
  skipReason: SkipReason | null         // reducer-provided enum (SPEC request #1)
  winnerPlayerId: string | null
events ↑ (none)
renders
  - lobby/playing/finished aware headline.
  - "Your turn — roll the cowries" / "<Name> is rolling…".
  - After a roll with 0 legal moves: the §5.4 sentence for skipReason.
  - Bonus turn note when roll.grantsBonusTurn or a hit occurred.
  - Winner announcement when finished.
a11y: aria-live="polite" container.
```

---

## 8. Board connectors must NOT assume step-1 grid adjacency

The path (`SOUTH_PATH` and its rotations) is **not** a simple ring of grid-adjacent cells.
Two structural discontinuities exist:

1. **Ring-transition jumps.** The path winds the outer ring, then steps inward to the middle
   ring, then the inner ring. At each ring transition the two consecutive path coordinates
   are diagonally or non-adjacently placed on the 7×7 grid (e.g. outer `[6,2]` → middle
   `[5,2]` is adjacent, but the wind direction reverses; and middle→inner transitions like
   `[5,3]` → `[4,3]` sit at ring boundaries). The path order, not grid neighbourhood, defines
   succession.
2. **Diagonal final hop to center.** The last inner-ring coordinate steps to the center
   `[3,3]` — index 47 → 48 — which is a diagonal move on the grid.

Design consequences:

- **Connectors / direction arrows** (if drawn) are computed by walking `PATHS[side]` in index
  order and connecting `path[i]` to `path[i+1]` by their actual grid centers — a straight line
  between centers, which naturally renders the diagonal final hop and ring jumps correctly.
  Never infer the next cell from "the cell to the left/up/etc."
- **Move preview** for a `LegalMove` highlights the trail `path[fromIndex+1 .. toIndex]`
  (using `from`/`fromIndex`/`toIndex` on the move), so the previewed route follows the true
  path including jumps, not a Manhattan walk across the grid.
- **Pawn placement** for an active pawn is `PATHS[player.side][pawn.pathIndex]` — always
  index-driven.
- The Board component takes `PATHS` (or a `coordForPawn(pawn, side)` helper from the domain
  layer) as the single geometry authority. The UI imports path geometry; it does not
  re-derive it.

> Implementation note for developers: expose a pure helper such as
> `pathTrail(side, fromIndex, toIndex): Coord[]` from the domain so the Board can render
> previews without owning path math (keeps I-CB1/I-CB2 intact).

---

## 9. Visual style direction

Clean, warm, and rooted in the physical game — a cloth/chalk Chowka Bara board, not a
generic glossy app. Avoid neon gradients, glassmorphism, and the "purple AI SaaS" look.

### 9.1 Palette

- **Board ground:** warm parchment / unbleached cotton (`#F4ECD8`-ish), with a faint
  hand-drawn grid stroke in muted sepia (`#8A6F4E`). Safe and center houses use subtle
  block-printed motifs rather than flat fills.
- **Side colors (one role per side), chosen for contrast and cultural warmth:**

  | Side  | Role color | Intent |
  |-------|-----------|--------|
  | South | Indigo / deep blue | calm, grounding (bottom) |
  | East  | Marigold / saffron-gold | bright, festive |
  | North | Terracotta / brick red | warm, traditional |
  | West  | Forest / leaf green | balanced, earthy |

  These map to `Player.color`; the UI uses `player.color` as the source of truth and only
  falls back to this table for defaults. Each color is paired with a **side label and a
  distinct pawn shape/pattern** so the game is not color-only (color-blind safe).

- **Safe houses:** marked with a small lotus / X cross motif (a traditional safe-square mark)
  in sepia, plus a soft halo. Clearly "this is a refuge" without a loud fill.
- **Center (finish):** the visual focal point — a larger rangoli-style medallion in a neutral
  gold/sepia, slightly raised. Finished pawns cluster around or rest on it with order badges.
- **Legal highlight:** a warm gold ring (not a flashing neon). **Preview:** a dotted trail
  along the true path. **Selected:** a solid gold ring + subtle lift. **Blocked safe (on
  inspect):** a muted lock/shield motif with the explanatory tooltip.

### 9.2 Type & texture

- Headings in a humanist serif or a warm display face (evoking hand lettering); body in a
  clean, highly legible sans for readability and a11y.
- Subtle paper grain texture on the board ground; everything else flat and calm.
- Motion is gentle and purposeful: cowrie toss settle, pawn glide along the path, a soft
  pulse on the current player — all respect `prefers-reduced-motion` (replace with instant
  state changes + the text equivalents already specified).

### 9.3 Cowrie rendering

- Six small shell glyphs: **open** face shows the slit/concave side (light interior),
  **closed** shows the rounded shell back. Distinct silhouettes so open vs closed reads
  without color. Roll animation is a brief tumble that settles into final faces; the numeric
  value and Chowka/Bhara label appear immediately for non-animated/reduced-motion users.

---

## 10. Traceability to CB6

| Requirement | Where satisfied |
|---|---|
| CB6-FR1 board 7×7, safe/start/center visible | §2 Board/House, §9 |
| CB6-FR2 current turn prominent | PlayerPanel `isCurrent`, TurnBanner (§3, §7) |
| CB6-FR3 cowrie faces shown | CowrieRoll (§3, §9.3) |
| CB6-FR4 legal moves highlighted | §3 MovePicker/Board, §4 |
| CB6-FR5 illegal not clickable | §3 House (tabindex/no handler), §4 |
| CB6-FR6 destination preview hover/tap | §3 Board hover events, §8 preview |
| CB6-FR7 hit announced + history | GameHistory, Toasts (§3, §5.3) |
| CB6-FR8 home/active/finished distinct | Pawn states (§3, §9.1) |
| CB6-FR9 responsive | §6 |
| CB6-FR10 keyboard accessible | §5.1 |
| CB6-FR11 screen-reader labels | §5.2 |
| CB6-FR12 explain no legal moves | §5.4, §7 |
| CB6-AC1 only legal interactive | §4 |
| CB6-AC2 blocked safe explained | House `blockedReason`, §5.2/§5.4 |
| CB6-AC3 hit visual + history | §3 GameHistory, §5.3 |
| CB6-AC4 no horizontal scroll on phone | §6 |
| CB6-AC5 keyboard reaches roll/select/confirm/cancel | §5.1 |

---

## 11. UI-driven SPEC requests (folded back to lead/architect)

The UI needs the following so it can render without recomputing rule logic (preserving
I-CB1 / I-CB2). These are requests to add to `GameState` / reducer output or the
domain helpers:

1. **`skipReason` on no-move turns.** When `legalMoves` is empty for the current roll, the
   reducer should expose a typed reason (enum + optional detail), e.g.
   `"start-blocked" | "all-targets-blocked" | "inner-path-locked" | "would-overshoot" | "mixed"`.
   Required for CB6-FR12 without the UI re-deriving blocking logic.
2. **`pathTrail(side, fromIndex, toIndex): Coord[]` domain helper** (and/or
   `coordForPawn(pawn, side): Coord`). Lets Board render previews and place pawns along the
   true path (ring jumps + diagonal center hop) without owning path math (§8).
3. **`hostId` (or `isHost` per player) in `GameState`.** Needed for StartGameButton gating
   (CB5-FR6) — currently inferable only indirectly.
4. **`blockedSafeHouses` / inspectable block metadata (optional).** A list of coords whose
   landing is blocked by a protected opponent this turn, so House can show the CB6-AC2
   "protected; stacking not allowed" explanation deterministically from reducer output.
5. **`grantsBonusTurn` / hit-bonus signal surfaced per resolved move** in history or current
   state, so TurnBanner/Toasts can say "Bonus turn!" without inferring it. (`CowrieRoll.
   grantsBonusTurn` covers 6/12; a hit-bonus flag covers CB3-FR12.)
6. **Confirmation that `SelectMoveCommand` accepts a `LegalMove.id`** (or the move's
   `pawnId`+`toIndex`) as its payload, so MovePicker can dispatch by referencing reducer
   output directly rather than reconstructing a move.

None of these change game rules; they expose already-computed facts to the view layer.
```
