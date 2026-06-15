/**
 * Verifies a Supabase project is wired correctly AND hardened for Chowka Bhara
 * Online. Contains NO secrets — reads keys from the environment.
 *
 *   node --env-file=.env.local scripts/verify-supabase.mjs
 *
 * Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
 * Optional: SUPABASE_SERVICE_ROLE_KEY (enables the write-path mechanics checks).
 *
 * What it asserts:
 *   1. SECURITY — a direct anon write to `rooms` is DENIED by RLS (the core
 *      regression test for the server-authority model). The anon key may read
 *      but never write.
 *   2. The `reclaim_tokens` table no longer exists / is not anon-readable.
 *   3. (service key) CAS mechanics: insert, conditional fresh/stale update,
 *      presence race — exactly one writer wins per revision.
 *   4. (anon auth + deployed function) the `command` Edge Function accepts an
 *      authenticated create and rejects acting as another player.
 *   5. Realtime change delivery (non-fatal: websocket latency is flaky from CI).
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in the environment.');
  process.exit(1);
}

const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const admin = serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false } })
  : null;

const gameId = `verify-${Math.floor(Math.random() * 1e9)}`;
let failures = 0;
let warnings = 0;
const ok = (label) => console.log(`  ✓ ${label}`);
const bad = (label, detail) => {
  console.log(`  ✗ ${label}: ${detail ?? ''}`);
  failures++;
};
const warn = (label, detail) => {
  console.log(`  ⚠ ${label}: ${detail ?? ''}`);
  warnings++;
};

async function main() {
  console.log(`Verifying Supabase wiring + hardening against ${url}`);
  console.log(`Test room: ${gameId}\n`);

  // 1. SECURITY: anon writes must be denied by RLS.
  {
    const { data, error } = await anon
      .from('rooms')
      .insert({ game_id: gameId, revision: 0, state: { gameId, status: 'lobby' } })
      .select();
    if (error) {
      ok('anon write to rooms is denied by RLS');
    } else if (data && data.length > 0) {
      bad('anon write to rooms SUCCEEDED — RLS is NOT locked down', 'apply migration 0002');
      if (admin) await admin.from('rooms').delete().eq('game_id', gameId); // clean the leak
    } else {
      ok('anon write to rooms returned no rows (denied)');
    }
  }

  // 2. reclaim_tokens must be gone / not anon-readable.
  {
    const { error } = await anon.from('reclaim_tokens').select('token').limit(1);
    if (error) ok('reclaim_tokens is absent / not anon-accessible');
    else bad('reclaim_tokens is still anon-readable', 'drop it (migration 0002)');
  }

  // 3. CAS mechanics (requires service role).
  if (!admin) {
    warn('CAS mechanics skipped', 'set SUPABASE_SERVICE_ROLE_KEY to run write-path checks');
  } else {
    {
      const { error } = await admin
        .from('rooms')
        .insert({ game_id: gameId, revision: 0, state: { gameId, status: 'lobby' } });
      error ? bad('service insert rooms', error.message) : ok('service insert rooms');
    }
    {
      const fresh = await admin
        .from('rooms')
        .update({ revision: 1 })
        .eq('game_id', gameId)
        .eq('revision', 0)
        .select();
      fresh.error || fresh.data?.length !== 1
        ? bad('CAS update (fresh)', fresh.error?.message ?? 'no row updated')
        : ok('CAS update (fresh revision wins)');

      const stale = await admin
        .from('rooms')
        .update({ revision: 2 })
        .eq('game_id', gameId)
        .eq('revision', 0)
        .select();
      stale.error
        ? bad('CAS update (stale)', stale.error.message)
        : stale.data?.length === 0
          ? ok('CAS update (stale revision rejected)')
          : bad('CAS update (stale)', 'stale write was NOT rejected');
    }
    {
      const a = await admin
        .from('rooms')
        .update({ revision: 2, state: { gameId, presence: 'A' } })
        .eq('game_id', gameId)
        .eq('revision', 1)
        .select();
      const b = await admin
        .from('rooms')
        .update({ revision: 2, state: { gameId, presence: 'B' } })
        .eq('game_id', gameId)
        .eq('revision', 1)
        .select();
      a.data?.length === 1 && b.data?.length === 0
        ? ok('presence CAS (one writer wins, the other re-reads)')
        : bad('presence CAS', `winner rows=${a.data?.length}, loser rows=${b.data?.length}`);
    }
  }

  // 4. Edge Function authority (requires anon sign-in + deployed function).
  {
    const { data: signIn, error: signErr } = await anon.auth.signInAnonymously();
    if (signErr || !signIn?.user) {
      warn(
        'command function smoke skipped',
        `anonymous sign-in unavailable: ${signErr?.message ?? ''}`,
      );
    } else {
      const fnRoom = `verify-fn-${Math.floor(Math.random() * 1e9)}`;
      const create = await anon.functions.invoke('command', {
        body: { kind: 'create', gameId: fnRoom, hostName: 'verifier' },
      });
      if (create.error) {
        warn('command function smoke', `not deployed? ${create.error.message}`);
      } else if (create.data?.playerId === signIn.user.id) {
        ok('command function: authenticated create binds playerId to uid');
        // Acting as someone else must be rejected.
        const spoof = await anon.functions.invoke('command', {
          body: {
            kind: 'command',
            command: {
              commandId: crypto.randomUUID(),
              type: 'START_GAME',
              gameId: fnRoom,
              playerId: 'not-my-uid',
              expectedRevision: 0,
              issuedAt: Date.now(),
            },
          },
        });
        // Rejected either as a 200 result {accepted:false} or a non-2xx error.
        const spoofRejected = spoof.error != null || spoof.data?.result?.accepted === false;
        spoofRejected
          ? ok('command function: rejects acting as another player')
          : bad('command function spoof', 'a foreign playerId was NOT rejected');
        if (admin) await admin.from('rooms').delete().eq('game_id', fnRoom);
      } else {
        bad('command function create', 'response did not bind playerId to the auth uid');
      }
    }
  }

  // 5. Realtime delivery (non-fatal). Needs a writer to trigger a change.
  if (admin) {
    const got = await new Promise((resolve) => {
      const ch = anon
        .channel(`verify:${gameId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rooms', filter: `game_id=eq.${gameId}` },
          () => {
            resolve(true);
            void anon.removeChannel(ch);
          },
        )
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await admin.from('rooms').update({ revision: 3 }).eq('game_id', gameId);
          }
        });
      setTimeout(() => resolve(false), 20000);
    });
    got
      ? ok('realtime change delivered')
      : warn(
          'realtime',
          'no event in 20s (non-fatal — websocket latency from CI; locally run `alter publication supabase_realtime add table public.rooms;`)',
        );
  }

  // Cleanup.
  if (admin) {
    await admin.from('rooms').delete().eq('game_id', gameId);
    ok('cleanup');
  }

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
