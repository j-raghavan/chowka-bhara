# ADR-0003 — Server Authority, Anonymous Auth & RLS Lockdown

- **Status:** Accepted
- **Date:** 2026-06-15
- **Supersedes:** the v0.1 "friendly-room" Supabase posture documented in the old
  `supabase-transport.ts` header and §"Supabase setup" of the README.
- **Relates to:** ADR-0001 (architecture / `GameTransport` port), the security review
  of the codebase.

---

## 1. Context

The Supabase transport shipped a deliberately permissive v0.1 schema:

```sql
create policy rooms_rw  on rooms          for all using (true) with check (true);
create policy tokens_rw on reclaim_tokens for all using (true) with check (true);
```

Because the app is a static client (GitHub Pages) holding the **public anon key**, this
made the client the sole authority. A security review found that anyone could, with the
anon key alone:

1. `UPDATE rooms SET state=<arbitrary>` directly via PostgREST, bypassing the reducer/CAS
   entirely — instant-win, move opponents' pawns, forge revisions (**critical**).
2. `SELECT * FROM reclaim_tokens` and harvest every token → hijack any seat (**critical**).
3. `DELETE` all rooms/tokens or flood inserts — no auth, no rate limit (**high**).
4. Spoof `playerId`: commands carried a client-chosen id with nothing binding a session to
   a player (**medium**).

The pure reducer's turn/host/ownership checks only ever constrained *honest* clients.

## 2. Decision

Make the Supabase backend **server-authoritative** and bind identity to authentication.

### D1 — The Edge Function is the only writer
All mutations go through `supabase/functions/command` (Deno), which runs the **same**
shared `runCas`/reducer (`src/transport/cas.ts`, `src/domain/*`) with the **service-role
key**. RLS is enabled with a read-only `rooms_read` policy and **no client write policy**,
so anon/authenticated writes are denied by default. Clients keep reading directly
(SELECT + realtime) for spectating and live updates.

### D2 — Identity is the anonymous-auth uid
The client signs in with Supabase **anonymous auth**; the session lives in
`sessionStorage` (per-tab → two tabs are two players; a refresh keeps the seat). The
auth **uid is the playerId**. The function derives the uid from the caller's JWT and
**rejects any command whose `playerId` differs from the uid** — eliminating spoofing.

### D3 — Drop `reclaim_tokens`
With the uid as a stable per-tab identity, reclaim tokens are obsolete. The table — which
was the world-readable seat-hijack vector — is dropped (`migrations/0002_security.sql`).

### D4 — Validate boundary input centrally
`src/domain/validation.ts` (pure, shared by client and function) sanitises/clamps display
names and constrains room ids to `^[A-Za-z0-9_-]{1,64}$`, which also closes the
PostgREST realtime-filter (`game_id=eq.${gameId}`) interpolation vector.

## 3. Consequences

- **Positive:** the four findings above are closed; client tampering can no longer mutate
  state; no token table to leak; identity is cryptographically tied to the caller. The
  reducer remains the single source of truth — it just runs server-side now (DRY: the
  function imports the exact same domain modules).
- **Cost / new requirements:** a Supabase **Auth** dependency (anonymous sign-ins must be
  enabled) and a deployed Edge Function. Hardening is inert until **both** migrations are
  applied **and** `supabase functions deploy command` has run.
- **Unchanged:** `broadcast` and `memory` transports are local-only and carry no trust
  boundary (dev/test/same-browser play). Only `supabase` is multiplayer-secure.
- **Verification:** `scripts/verify-supabase.mjs` asserts the posture (anon write denied,
  `reclaim_tokens` gone) and, with a service-role key, the CAS mechanics and function
  authority. This runs against a live project — it is **not** part of the unit/CI coverage
  gate (the transport + function are IO/platform glue, excluded by design).

## 4. Alternatives considered

- **Keep `reclaim_tokens`, make it function-only (no client SELECT).** Smaller change but
  retains a token table and does not bind identity to real auth (playerId would still be
  function-trusted input, not cryptographically the caller). Rejected in favour of D2/D3.
- **Postgres `security definer` RPC instead of an Edge Function.** Reimplementing the TS
  reducer in PL/pgSQL would duplicate and risk diverging from the authoritative engine.
  Rejected (violates DRY / single-source-of-truth).
