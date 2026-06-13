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

/** Track a commandId in the bounded idempotency ring. */
export function rememberCommandId(
  ids: readonly string[],
  commandId: string,
  max: number = MAX_RECENT_COMMAND_IDS,
): readonly string[] {
  return [...ids, commandId].slice(-max);
}
