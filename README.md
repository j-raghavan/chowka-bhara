# Chowka Bhara Online

An open-source, online-only implementation of the traditional South Indian board game
**Chowka Bhara / Chowka Bara** on a **7×7 board** for **2–4 players**, playable in the
browser and deployable to **GitHub Pages**.

> Status: v0.1. Architecture decisions live in [`docs/adr/`](docs/adr/) and the UI design in
> [`docs/DESIGN-UI.md`](docs/DESIGN-UI.md). The full rules are in [the Rules section](#rules) below.

## How to play

Chowka Bhara Online is **online and room-based** — there's no single-device pass-and-play.

1. **Create a room.** Open the app, enter your name, and click **Create a room**. You become the
   host and land in the lobby.
2. **Invite players.** Click **Copy invite link** and send the URL to friends. Each person opens it,
   enters a name, and **takes a seat** (2–4 players). To try it solo, open the same link in a second
   browser tab — each tab is a separate player.
3. **Start.** When 2–4 players are seated, the **host** clicks **Start game**. Sides are assigned
   automatically (2P = South & North; 3P adds East; 4P adds West).
4. **Take your turn.** On your turn, click **Roll cowries**. Legal destinations are highlighted on
   the board — hover/focus to preview the path, then click (or press Enter) to move. Rolling a 6
   (*Chowka*) or 12 (*Bhara*), or hitting an opponent, earns another turn.
5. **Win.** First player to bring all their pawns home to the centre crown wins. The full rules are
   always available via the in-game **Rules** panel.

**Reconnecting:** if you refresh or briefly disconnect, you keep your seat — reopen the room URL in
the same tab and you're back in. **Spectating:** opening a link to a full or in-progress room lets
you watch without a seat.

Extra seats fill anti-clockwise (South → East → North → West). Your first pawn comes out on a roll
of 1; after that, any pawn can come out on any roll. You must hit an opponent before your pawns may
enter the inner rings.

## Architecture

Ports-and-adapters. The rules engine is a pure, deterministic TypeScript module with no
dependency on React, the DOM, browser storage, or any realtime backend.

```
src/domain/      pure rules engine (board, paths, cowries, legal moves, reducer, invariants)
src/app/         application services (command orchestration, local player token)
src/transport/   GameTransport port + adapters (memory, browser/localStorage, Supabase)
src/components/   React UI
src/pages/        Home (lobby) and Game pages
```

## Development

```bash
npm install
npm test          # unit + integration tests (Vitest)
npm run coverage  # coverage (domain/app/transport must be >= 97%)
npm run lint      # ESLint
npm run typecheck # TypeScript strict
npm run dev       # local dev server
npm run build     # static build to dist/
```

## Online play & transports

The app is online-only and room-based. Create a room, then share its URL
(`#/room/:gameId`) — friends open it to take a seat, or open it in a second
browser tab to play yourself. Seat identity is per-tab: on the Supabase backend
each tab holds its own anonymous-auth session (in sessionStorage), so a refresh
keeps your seat while a second tab is a distinct player.

The realtime backend is a swappable adapter behind one `GameTransport` port,
selected at build time with `VITE_TRANSPORT`:

| `VITE_TRANSPORT` | Backend | Scope |
|---|---|---|
| `broadcast` (default) | localStorage + BroadcastChannel | Same-browser, multiple tabs. Zero infra; rooms survive refresh. |
| `memory` | in-memory | Single tab (tests/dev). |
| `supabase` | Postgres + Realtime | Cross-device online. Requires a Supabase project. |

### Supabase setup (cross-device play)

The Supabase backend is **server-authoritative** (see
[Security model](#security-model--trust-assumptions) and
[ADR-0003](docs/adr/ADR-0003-server-authority-and-auth.md)): clients only read
room state; all writes go through an Edge Function.

1. Create a Supabase project and apply the migrations in
   [`supabase/migrations/`](supabase/migrations) (base `rooms` table, locked-down
   RLS — read-only for clients, no `reclaim_tokens`).
2. Enable **Anonymous sign-ins** (Authentication → Providers) — player identity
   is the anonymous-auth uid.
3. Deploy the server authority: `supabase functions deploy command`
   ([`supabase/functions/command`](supabase/functions/command)). It uses the
   service-role key (auto-injected into Edge Functions — never shipped to the client).
4. Set build-time env (public anon key only — never the service-role key):
   ```
   VITE_TRANSPORT=supabase
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-public-key>
   ```
5. Build and deploy. The Supabase client is loaded in a lazy chunk, so the
   default (`broadcast`) build never ships it.

Verify the backend is wired correctly **and hardened** — it asserts that a direct
anon write is denied and `reclaim_tokens` is gone, and (with a service-role key)
exercises the optimistic-CAS mechanics, the `command` function, and realtime:

```bash
# reads creds from .env.local; set SUPABASE_SERVICE_ROLE_KEY to run write-path checks
npm run verify:supabase
```

Concurrency safety is identical across adapters: every command is applied through
one shared compare-and-set transaction (`src/transport/cas.ts`) keyed on
`expectedRevision`, so exactly one writer wins per revision (no lost updates).

## Rules

Chowka Bhara Online uses a **7×7 board** and **6 cowries**. Default ruleset: `7x7-six-cowrie-v1`.
The same rules are surfaced in-app via the Rules panel.

| Open cowries | Move value |
|---:|:---|
| 0 | 12 — *Bhara / Bara* |
| 1 | 1 |
| 2 | 2 |
| 3 | 3 |
| 4 | 4 |
| 5 | 5 |
| 6 | 6 — *Chowka* |

- Your **first** pawn comes out only on a roll of **1** (landing on the first house past the home
  marker). **Once you have a pawn on the board, the rest can come out on any roll** — moving that
  many houses from home — so each turn you may advance an on-board pawn *or* bring another one out.
- Rolling **6 or 12**, or **hitting an opponent**, grants an extra turn.
- **Safe houses** are the 8 ✕-marked squares: the 4 board corners and the 4 corners of the inner
  ring. On a safe house a pawn **cannot be hit**, and **any number of pawns (of any players) may
  share it**.
- On a **non-safe** house only one pawn may stand: landing on an opponent there sends it home and
  you take the house; you cannot land on your own pawn.
- You must **hit at least one opponent** before entering the inner rings (path index ≥ 24).
- A pawn must land **exactly** on the center to finish. First to bring all pawns home **wins**.

The ruleset id is stored with every game, so an in-progress game keeps its rules even if a
future variant becomes the default (CB8-FR4/FR6). The in-game **Rules** panel and the project's
ADRs in [`docs/`](docs/) document the project-specific deviations from regional variants.

## Security model & trust assumptions

The rules engine is deterministic and the same `cas.ts` transaction guards every
adapter, but **where that engine runs determines what a malicious client can do.**

- **`broadcast` / `memory`** transports are local to one browser. There is no
  shared server and no trust boundary — they are for same-browser play, dev, and
  tests only. Do not treat them as multiplayer-secure.
- **`supabase`** is **server-authoritative**. Clients may *read* room state (so
  players and spectators can watch) but cannot write it: RLS denies all client
  writes and every command is applied by the
  [`command` Edge Function](supabase/functions/command), which runs the
  authoritative reducer with the service-role key. Player identity is bound to an
  anonymous-auth session — the uid *is* the playerId, and the function rejects any
  command issued for a different player. See
  [ADR-0003](docs/adr/ADR-0003-server-authority-and-auth.md).

Boundary input is validated centrally in
[`src/domain/validation.ts`](src/domain/validation.ts): display names are
sanitised/clamped and room ids are restricted to a safe charset (also closing a
realtime-filter injection vector). The shipped `VITE_SUPABASE_ANON_KEY` is a
public client key and is safe to commit to a deployment; the service-role key is
never bundled (a CI step greps `dist/` to enforce this).

> ⚠️ Hardening only takes effect once **both** migrations are applied **and** the
> `command` function is deployed. A project still running the old permissive
> `using(true)` policy is fully tamperable. `npm run verify:supabase` asserts the
> locked-down posture against your live project.

## License

MIT — see [LICENSE](LICENSE).
