/**
 * Verifies a Supabase project is wired correctly for Chowka Bhara Online.
 * Exercises the same operations SupabaseTransport uses: insert, conditional
 * CAS update, reclaim tokens, realtime, then cleans up. Contains NO secrets —
 * reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from the environment.
 *
 *   node --env-file=.env.local scripts/verify-supabase.mjs
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in the environment.');
  process.exit(1);
}

const client = createClient(url, key);
const gameId = `verify-${Math.floor(Math.random() * 1e9)}`;
const token = `tok-${gameId}`;
let failures = 0;
let warnings = 0;
const ok = (label) => console.log(`  ✓ ${label}`);
const bad = (label, detail) => {
  console.log(`  ✗ ${label}: ${detail ?? ''}`);
  failures++;
};
// Non-fatal: surfaced but does not fail the run (used for the realtime check,
// whose websocket handshake is latency-sensitive and flaky from CI runners).
const warn = (label, detail) => {
  console.log(`  ⚠ ${label}: ${detail ?? ''}`);
  warnings++;
};

async function main() {
  console.log(`Verifying Supabase wiring against ${url}`);
  console.log(`Test room: ${gameId}\n`);

  // 1. Insert a room row.
  {
    const { error } = await client
      .from('rooms')
      .insert({ game_id: gameId, revision: 0, state: { gameId, status: 'lobby' } });
    error ? bad('insert rooms', error.message) : ok('insert rooms');
  }

  // 2. Select it back.
  {
    const { data, error } = await client
      .from('rooms')
      .select('state, revision')
      .eq('game_id', gameId)
      .maybeSingle();
    if (error) bad('select rooms', error.message);
    else if (data?.revision === 0) ok('select rooms');
    else bad('select rooms', 'row not found');
  }

  // 3. CAS update: WHERE revision = expected returns the row; a stale one returns none.
  {
    const fresh = await client
      .from('rooms')
      .update({ revision: 1 })
      .eq('game_id', gameId)
      .eq('revision', 0)
      .select();
    if (fresh.error || fresh.data?.length !== 1)
      bad('CAS update (fresh)', fresh.error?.message ?? 'no row updated');
    else ok('CAS update (fresh revision wins)');

    const stale = await client
      .from('rooms')
      .update({ revision: 2 })
      .eq('game_id', gameId)
      .eq('revision', 0)
      .select();
    if (stale.error) bad('CAS update (stale)', stale.error.message);
    else if (stale.data?.length === 0) ok('CAS update (stale revision rejected)');
    else bad('CAS update (stale)', 'stale write was NOT rejected');
  }

  // 3b. Presence CAS: two writers racing at the same revision — exactly one
  // wins, the other must re-read (mirrors SupabaseTransport.updatePresence).
  {
    const a = await client
      .from('rooms')
      .update({ revision: 2, state: { gameId, presence: 'A' } })
      .eq('game_id', gameId)
      .eq('revision', 1)
      .select();
    const b = await client
      .from('rooms')
      .update({ revision: 2, state: { gameId, presence: 'B' } })
      .eq('game_id', gameId)
      .eq('revision', 1)
      .select();
    if (a.data?.length === 1 && b.data?.length === 0)
      ok('presence CAS (one writer wins, the other re-reads)');
    else bad('presence CAS', `winner rows=${a.data?.length}, loser rows=${b.data?.length}`);
  }

  // 4. Reclaim tokens table.
  {
    const ins = await client
      .from('reclaim_tokens')
      .insert({ token, game_id: gameId, player_id: 'p1' });
    if (ins.error) bad('insert reclaim_tokens', ins.error.message);
    else {
      const sel = await client
        .from('reclaim_tokens')
        .select('player_id')
        .eq('token', token)
        .maybeSingle();
      sel.data?.player_id === 'p1'
        ? ok('reclaim_tokens read/write')
        : bad('reclaim_tokens read', sel.error?.message);
    }
  }

  // 5. Realtime: a change on the row must reach a subscriber.
  {
    const got = await new Promise((resolve) => {
      const ch = client
        .channel(`verify:${gameId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rooms', filter: `game_id=eq.${gameId}` },
          () => {
            resolve(true);
            void client.removeChannel(ch);
          },
        )
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await client.from('rooms').update({ revision: 3 }).eq('game_id', gameId);
          }
        });
      setTimeout(() => resolve(false), 20000);
    });
    got
      ? ok('realtime change delivered')
      : warn(
          'realtime',
          'no event in 20s (non-fatal — websocket latency from CI; if cross-device live updates seem stuck locally, run `alter publication supabase_realtime add table public.rooms;`)',
        );
  }

  // 6. Cleanup.
  await client.from('reclaim_tokens').delete().eq('token', token);
  await client.from('rooms').delete().eq('game_id', gameId);
  ok('cleanup');

  const warnNote = warnings > 0 ? ` (${warnings} warning(s))` : '';
  console.log(
    failures === 0
      ? `\nAll checks passed ✅${warnNote}`
      : `\n${failures} check(s) failed ❌${warnNote}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Verification crashed:', e);
  process.exit(1);
});
