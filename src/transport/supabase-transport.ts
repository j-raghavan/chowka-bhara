/**
 * Production transport adapter backed by Supabase (Postgres + Realtime).
 *
 * It satisfies the SAME GameTransport CAS contract (C1-C5) as FakeTransport,
 * using Postgres optimistic concurrency: the mutation is an
 *   UPDATE rooms SET state=?, revision=expected+1 WHERE game_id=? AND revision=expected
 * so exactly one writer wins at a given revision (I-CB17). The reducer runs via
 * the shared `runCas` helper before the conditional UPDATE.
 *
 * This module is platform/IO glue: it is excluded from the unit-coverage gate
 * and is verified against a live Supabase project, not in unit tests.
 *
 * Expected schema (apply via Supabase SQL editor):
 *
 *   create table rooms (
 *     game_id   text primary key,
 *     revision  integer not null default 0,
 *     state     jsonb   not null,
 *     updated_at timestamptz not null default now()
 *   );
 *   create table reclaim_tokens (
 *     token     text primary key,
 *     game_id   text not null,
 *     player_id text not null
 *   );
 *   alter table rooms enable row level security;
 *   alter table reclaim_tokens enable row level security;
 *   -- v0.1 friendly-room policy: anyone may read/write room rows. Tighten for
 *   -- adversarial play (e.g. signed player tokens, server-validated commands).
 *   create policy rooms_rw on rooms for all using (true) with check (true);
 *   create policy tokens_rw on reclaim_tokens for all using (true) with check (true);
 */
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from '@supabase/supabase-js';
import { runCas } from './cas';
import { createInitialState } from '../domain/game-setup';
import type { DomainEnv, GameCommand, GameState, PlayerStatus } from '../domain/types';
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

  constructor(
    private readonly env: DomainEnv,
    private readonly client: SupabaseClient,
  ) {}

  getState(gameId: string): GameState | undefined {
    return this.cache.get(gameId);
  }

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    const gameId = input.gameId ?? this.env.ids.next();
    const hostId = this.env.ids.next();
    const state = createInitialState({ gameId, hostId, hostName: input.hostName }, this.env);
    await this.client.from('rooms').insert({ game_id: gameId, revision: 0, state });
    this.cache.set(gameId, state);
    const reclaimToken = await this.issueToken(gameId, hostId);
    return { gameId, playerId: hostId, reclaimToken, state };
  }

  async joinRoom(input: JoinRoomInput): Promise<JoinRoomResult> {
    let state = await this.fetch(input.gameId);
    if (state === undefined) throw new Error(`unknown room ${input.gameId}`);

    if (input.reclaimToken !== undefined) {
      const record = await this.lookupToken(input.reclaimToken);
      if (record !== null && record.game_id === input.gameId && state.players[record.player_id]) {
        await this.updatePresence(input.gameId, record.player_id, 'connected');
        state = await this.fetch(input.gameId);
        return {
          playerId: record.player_id,
          reclaimToken: input.reclaimToken,
          spectator: false,
          state: state!,
        };
      }
    }

    if (state.status !== 'lobby' || state.playerOrder.length >= state.config.maxPlayers) {
      return { playerId: '', reclaimToken: '', spectator: true, state };
    }

    const playerId = this.env.ids.next();
    const command: GameCommand = {
      commandId: this.env.ids.next(),
      type: 'JOIN_ROOM',
      gameId: input.gameId,
      playerId,
      displayName: input.displayName,
      expectedRevision: state.revision,
      issuedAt: this.env.clock.now(),
    };
    await this.transactCommand(command);
    const reclaimToken = await this.issueToken(input.gameId, playerId);
    return { playerId, reclaimToken, spectator: false, state: this.cache.get(input.gameId)! };
  }

  subscribeRoom(gameId: string, onState: (state: GameState) => void): Unsubscribe {
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

  /**
   * CAS: run the reducer, then a conditional UPDATE keyed on the revision.
   * If zero rows match (someone else advanced the revision) it is a stale write.
   */
  async transactCommand(command: GameCommand): Promise<CommandResult> {
    const state = await this.fetch(command.gameId);
    const { result, next } = runCas(state, command, this.env);
    if (next === undefined) return result;

    const { data, error } = await this.client
      .from('rooms')
      .update({ state: next, revision: next.revision })
      .eq('game_id', command.gameId)
      .eq('revision', command.expectedRevision)
      .select();
    if (error || data === null || data.length === 0) {
      const current = await this.fetch(command.gameId);
      return {
        accepted: false,
        revision: current?.revision ?? state?.revision ?? 0,
        rejection: 'STALE_REVISION',
      };
    }
    this.cache.set(command.gameId, next);
    return result;
  }

  async updatePresence(gameId: string, playerId: string, status: PlayerStatus): Promise<void> {
    const state = await this.fetch(gameId);
    if (state === undefined) return;
    const player = state.players[playerId];
    if (player === undefined) return;
    const next: GameState = {
      ...state,
      players: {
        ...state.players,
        [playerId]: { ...player, status, lastSeenAt: this.env.clock.now() },
      },
    };
    await this.client.from('rooms').update({ state: next }).eq('game_id', gameId);
    this.cache.set(gameId, next);
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

  private async issueToken(gameId: string, playerId: string): Promise<string> {
    const token = this.env.ids.next();
    await this.client
      .from('reclaim_tokens')
      .insert({ token, game_id: gameId, player_id: playerId });
    return token;
  }

  private async lookupToken(token: string): Promise<{ game_id: string; player_id: string } | null> {
    const { data } = await this.client
      .from('reclaim_tokens')
      .select('game_id, player_id')
      .eq('token', token)
      .maybeSingle();
    return (data as { game_id: string; player_id: string } | null) ?? null;
  }
}
