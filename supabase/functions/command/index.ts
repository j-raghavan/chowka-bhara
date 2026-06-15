// Server authority for Chowka Bhara Online (Supabase Edge Function, Deno).
//
// This function is the ONLY writer to `public.rooms`. With RLS enabled and no
// client write policy (see supabase/migrations/0002_security.sql), browsers can
// read room state for spectating but cannot mutate it directly — every command
// runs here, through the SAME authoritative reducer the client used to run, with
// the service-role key.
//
// It also binds identity to authentication: the caller's anonymous-auth `uid`
// IS their playerId. A client therefore cannot act as another player (the old
// self-asserted playerId), and there is no reclaim-token table to leak.
//
// Reuses the shared, pure domain logic (single source of truth, DRY): the same
// reducer/CAS/setup modules under src/. The Supabase CLI bundles these when you
// run `supabase functions deploy command`.
//
// Verification: this cannot run in the app's unit/CI gate (Deno + live Supabase).
// Deploy it and exercise it via `npm run verify:supabase` and manual two-tab play.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { runCas } from '../../../src/transport/cas.ts';
import { createInitialState } from '../../../src/domain/game-setup.ts';
import { flatValueRandomSource } from '../../../src/domain/cowries.ts';
import { sanitizeDisplayName, isValidGameId } from '../../../src/domain/validation.ts';
import type { DomainEnv, GameCommand, GameState, PlayerStatus } from '../../../src/domain/types.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// Server DomainEnv: crypto UUIDs + a CSPRNG cowrie source (flattened odds, same
// distribution as the client's production env).
function cryptoFloat(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 2 ** 32;
}
const env: DomainEnv = {
  clock: { now: () => Date.now() },
  ids: { next: () => crypto.randomUUID() },
  random: flatValueRandomSource(cryptoFloat),
  devMode: false,
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function authUid(req: Request): Promise<string | null> {
  const authorization = req.headers.get('Authorization');
  if (!authorization) return null;
  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await authClient.auth.getUser();
  return error || !data.user ? null : data.user.id;
}

async function fetchState(gameId: string): Promise<GameState | undefined> {
  const { data } = await admin.from('rooms').select('state').eq('game_id', gameId).maybeSingle();
  return (data as { state: GameState } | null)?.state;
}

// Conditional write guarded on the previous revision (optimistic CAS). Returns
// true iff exactly one row matched (this writer won the revision race).
async function casWrite(gameId: string, prevRevision: number, next: GameState): Promise<boolean> {
  const { data, error } = await admin
    .from('rooms')
    .update({ state: next, revision: next.revision })
    .eq('game_id', gameId)
    .eq('revision', prevRevision)
    .select();
  return !error && data !== null && data.length > 0;
}

async function handleCreate(uid: string, body: any): Promise<Response> {
  const gameId: string = body.gameId ?? crypto.randomUUID();
  if (!isValidGameId(gameId)) return json({ error: 'invalid gameId' }, 400);
  const state = createInitialState(
    { gameId, hostId: uid, hostName: sanitizeDisplayName(String(body.hostName ?? '')) },
    env,
  );
  const { error } = await admin.from('rooms').insert({ game_id: gameId, revision: 0, state });
  if (error) return json({ error: error.message }, 409);
  return json({ gameId, playerId: uid, state });
}

async function handleJoin(uid: string, body: any): Promise<Response> {
  const gameId: string = body.gameId;
  if (!isValidGameId(gameId)) return json({ error: 'invalid gameId' }, 400);
  const state = await fetchState(gameId);
  if (state === undefined) return json({ error: 'unknown room' }, 404);

  // Already seated (reconnect): mark connected, no new seat.
  if (state.players[uid]) {
    await presence(gameId, uid, 'connected');
    const fresh = await fetchState(gameId);
    return json({ playerId: uid, spectator: false, state: fresh ?? state });
  }
  // Lobby with room: take a seat as `uid`.
  if (state.status === 'lobby' && state.playerOrder.length < state.config.maxPlayers) {
    const command: GameCommand = {
      commandId: crypto.randomUUID(),
      type: 'JOIN_ROOM',
      gameId,
      playerId: uid,
      displayName: sanitizeDisplayName(String(body.displayName ?? '')),
      expectedRevision: state.revision,
      issuedAt: env.clock.now(),
    };
    const applied = runCas(state, command, env);
    if (applied.next) await casWrite(gameId, state.revision, applied.next);
    const fresh = await fetchState(gameId);
    return json({ playerId: uid, spectator: false, state: fresh ?? state });
  }
  // Full or in-progress: spectator.
  return json({ playerId: '', spectator: true, state });
}

async function handleCommand(uid: string, body: any): Promise<Response> {
  const command = body.command as GameCommand;
  if (!command || !isValidGameId(command.gameId)) return json({ error: 'bad command' }, 400);
  // Authority: a caller may only act as themselves. This is a game-protocol
  // rejection, NOT a transport error, so it returns HTTP 200 with a rejecting
  // result — non-2xx would make supabase-js `functions.invoke` null `data` and
  // set `error`, which the client would mask as a generic STALE_REVISION.
  if (command.playerId !== uid) {
    return json({ result: { accepted: false, revision: 0, rejection: 'NOT_CURRENT_PLAYER' } });
  }
  const state = await fetchState(command.gameId);
  const { result, next } = runCas(state, command, env);
  if (next === undefined) return json({ result });
  const won = await casWrite(command.gameId, command.expectedRevision, next);
  if (!won) {
    const current = await fetchState(command.gameId);
    return json({
      result: {
        accepted: false,
        revision: current?.revision ?? state?.revision ?? 0,
        rejection: 'STALE_REVISION',
      },
    });
  }
  return json({ result });
}

async function presence(gameId: string, uid: string, status: PlayerStatus): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await fetchState(gameId);
    if (state === undefined) return;
    const player = state.players[uid];
    if (player === undefined) return;
    const next: GameState = {
      ...state,
      revision: state.revision + 1,
      players: { ...state.players, [uid]: { ...player, status, lastSeenAt: env.clock.now() } },
    };
    if (await casWrite(gameId, state.revision, next)) return;
  }
}

async function handlePresence(uid: string, body: any): Promise<Response> {
  if (!isValidGameId(body.gameId)) return json({ error: 'invalid gameId' }, 400);
  await presence(body.gameId, uid, body.status as PlayerStatus);
  return json({ ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const uid = await authUid(req);
  if (!uid) return json({ error: 'unauthenticated' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  switch (body?.kind) {
    case 'create':
      return handleCreate(uid, body);
    case 'join':
      return handleJoin(uid, body);
    case 'command':
      return handleCommand(uid, body);
    case 'presence':
      return handlePresence(uid, body);
    default:
      return json({ error: 'unknown kind' }, 400);
  }
});
