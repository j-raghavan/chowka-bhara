# Chowka Bhara Online

An open-source, online-only implementation of the traditional South Indian board game
**Chowka Bhara / Chowka Bara** on a **7×7 board** for **2–4 players**, playable in the
browser and deployable to **GitHub Pages**.

> Status: v0.1 in development. See [`spec/SPEC-CHOWKA-BHARA-ONLINE.md`](spec/SPEC-CHOWKA-BHARA-ONLINE.md)
> for the authoritative rules and design, and [`docs/adr/`](docs/adr/) for architecture decisions.

## Architecture

Ports-and-adapters. The rules engine is a pure, deterministic TypeScript module with no
dependency on React, the DOM, browser storage, or any realtime backend.

```
src/domain/      pure rules engine (board, paths, cowries, legal moves, reducer, invariants)
src/app/         application services (command orchestration, local player token)
src/transport/   GameTransport port + adapters (in-memory fake, Firebase/Supabase)
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

- A pawn enters the board **only on a roll of 1**.
- Rolling **6 or 12**, or **hitting an opponent**, grants an extra turn.
- **Only one pawn per house** — no stacking, no Gatti, no doubles, no paired movement.
- Landing on an opponent on a **non-safe** house sends it home and you take the house.
- A pawn on a **safe house** (the four start houses and the center) cannot be hit; because
  stacking is forbidden, an occupied safe house **blocks** landing.
- You must **hit at least one opponent** before entering the inner rings (path index ≥ 24).
- A pawn must land **exactly** on the center to finish. First to bring all pawns home **wins**.

The ruleset id is stored with every game, so an in-progress game keeps its rules even if a
future variant becomes the default (CB8-FR4/FR6). See the
[spec](spec/SPEC-CHOWKA-BHARA-ONLINE.md) for the full, authoritative definition and the
project-specific deviations from regional variants.

## License

MIT — see [LICENSE](LICENSE).
