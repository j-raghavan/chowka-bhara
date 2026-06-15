/**
 * Production transport adapter backed by Supabase (Postgres + Realtime).
 *
 * Authority model (see supabase/functions/command + supabase/migrations):
 *  - WRITES go through the `command` Edge Function, which is the only writer to
 *    `public.rooms` (service role). RLS denies all client writes; the function
 *    runs the SAME authoritative reducer via the shared `runCas`. A modified
 *    client can therefore no longer tamper with state by writing directly.
 *  - IDENTITY is the anonymous-auth `uid`: this transport signs in anonymously
 *    (session in sessionStorage, configured in public-config) so each tab is a
 *    distinct, stable player across refreshes. The uid IS the playerId; the
 *    function rejects commands whose playerId != uid. There is no reclaim-token
 *    table to leak (the old seat-hijack vector).
 *  - READS stay client-side: any client may SELECT room state (spectating) and
 *    subscribe to realtime row changes.
 *
 * This module is platform/IO glue: excluded from the unit-coverage gate and
 * verified against a live Supabase project (`npm run verify:supabase`), not in
 * unit tests.
 */
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from '@supabase/supabase-js';
import { assertValidGameId } from '../domain/validation';
import type { GameCommand, GameState, PlayerStatus } from '../domain/types';
import type {
  CommandResult,
  CreateRoomInput,
  CreateRoomResult,
  GameTransport,
  JoinRoomInput,
  JoinRoomResult,
  Unsubscribe,
} from './game-transport';

interface RoomRow {
  game_id: string;
  revision: number;
  state: GameState;
}

export class SupabaseTransport implements GameTransport {
  private readonly cache = new Map<string, GameState>();
  private readonly channels = new Map<string, RealtimeChannel>();
  private uidPromise: Promise<string> | null = null;

  constructor(private readonly client: SupabaseClient) {}

  getState(gameId: string): GameState | undefined {
    return this.cache.get(gameId);
  }

  /** Ensure an anonymous auth session and return its stable uid (the playerId). */
  private uid(): Promise<string> {
    if (this.uidPromise === null) {
      this.uidPromise = (async () => {
        const { data } = await this.client.auth.getSession();
        if (data.session?.user) return data.session.user.id;
        const { data: signed, error } = await this.client.auth.signInAnonymously();
        if (error || !signed.user) {
          throw new Error(`anonymous sign-in failed: ${error?.message ?? 'no user'}`);
        }
        return signed.user.id;
      })();
    }
    return this.uidPromise;
  }

  /** Invoke the server-authority Edge Function. Throws on transport error. */
  private async invoke<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.functions.invoke('command', { body });
    if (error) throw new Error(`command function error: ${error.message}`);
    return data as T;
  }

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    if (input.gameId !== undefined) assertValidGameId(input.gameId);
    const uid = await this.uid();
    const res = await this.invoke<{ gameId: string; playerId: string; state: GameState }>({
      kind: 'create',
      gameId: input.gameId,
      hostName: input.hostName,
    });
    this.cache.set(res.gameId, res.state);
    // reclaimToken is the auth uid; reconnection is via the persisted auth session.
    return {
      gameId: res.gameId,
      playerId: res.playerId || uid,
      reclaimToken: uid,
      state: res.state,
    };
  }

  async joinRoom(input: JoinRoomInput): Promise<JoinRoomResult> {
    assertValidGameId(input.gameId);
    const uid = await this.uid();
    const res = await this.invoke<{ playerId: string; spectator: boolean; state: GameState }>({
      kind: 'join',
      gameId: input.gameId,
      displayName: input.displayName,
    });
    this.cache.set(input.gameId, res.state);
    return {
      playerId: res.playerId,
      reclaimToken: res.spectator ? '' : uid,
      spectator: res.spectator,
      state: res.state,
    };
  }

  subscribeRoom(gameId: string, onState: (state: GameState) => void): Unsubscribe {
    assertValidGameId(gameId);
    void this.fetch(gameId).then((state) => {
      if (state !== undefined) onState(state);
    });
    const channel = this.client
      .channel(`room:${gameId}`)
      .on<RoomRow>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `game_id=eq.${gameId}` },
        (payload: RealtimePostgresChangesPayload<RoomRow>) => {
          const row = payload.new as RoomRow;
          this.cache.set(gameId, row.state);
          onState(row.state);
        },
      )
      .subscribe();
    this.channels.set(gameId, channel);
    return () => {
      void this.client.removeChannel(channel);
      this.channels.delete(gameId);
    };
  }

  /** Forward the command to the server authority, which runs the reducer + CAS. */
  async transactCommand(command: GameCommand): Promise<CommandResult> {
    assertValidGameId(command.gameId);
    await this.uid();
    try {
      const { result } = await this.invoke<{ result: CommandResult }>({ kind: 'command', command });
      return result;
    } catch {
      const current = this.cache.get(command.gameId);
      return { accepted: false, revision: current?.revision ?? 0, rejection: 'STALE_REVISION' };
    }
  }

  async updatePresence(gameId: string, _playerId: string, status: PlayerStatus): Promise<void> {
    assertValidGameId(gameId);
    await this.uid();
    // The server authority resolves presence for the authenticated uid; the
    // passed playerId is ignored (a caller may only update their own presence).
    try {
      await this.invoke({ kind: 'presence', gameId, status });
    } catch {
      /* presence is best-effort */
    }
  }

  private async fetch(gameId: string): Promise<GameState | undefined> {
    const { data } = await this.client
      .from('rooms')
      .select('state')
      .eq('game_id', gameId)
      .maybeSingle();
    const state = (data as { state: GameState } | null)?.state;
    if (state !== undefined) this.cache.set(gameId, state);
    return state;
  }
}
