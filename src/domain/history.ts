/** Game event creation and bounded history retention (CB4-FR8). */
import type { DomainEnv, GameEvent, GameEventType } from './types';

export const MAX_HISTORY = 200;
export const MAX_RECENT_COMMAND_IDS = 100;

export function makeEvent(
  type: GameEventType,
  env: DomainEnv,
  playerId: string | null,
  data?: Readonly<Record<string, unknown>>,
): GameEvent {
  const base = { id: env.ids.next(), type, playerId, at: env.clock.now() };
  return data === undefined ? base : { ...base, data };
}

export function appendEvents(
  history: readonly GameEvent[],
  events: readonly GameEvent[],
  max: number = MAX_HISTORY,
): readonly GameEvent[] {
  if (events.length === 0) return history;
  return [...history, ...events].slice(-max);
}

/**
 * Track a commandId in the bounded idempotency ring (I-CB16).
 * The ring is a secondary guard: the primary defence against re-applying a
 * command is the CAS `expectedRevision` check (a replay of an old command
 * already fails STALE_REVISION). The ring catches a same-revision duplicate;
 * `MAX_RECENT_COMMAND_IDS` (100) is far larger than any realistic in-flight
 * window for turn-based play.
 */
export function rememberCommandId(
  ids: readonly string[],
  commandId: string,
  max: number = MAX_RECENT_COMMAND_IDS,
): readonly string[] {
  return [...ids, commandId].slice(-max);
}
