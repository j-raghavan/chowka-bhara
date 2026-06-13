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

See [Appendix A of the spec](spec/SPEC-CHOWKA-BHARA-ONLINE.md) — full rules are documented
there and surfaced in-app via the Rules panel (feature CB8).

## License

MIT — see [LICENSE](LICENSE).
