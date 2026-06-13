/**
 * The one compare-and-set transaction body shared by every transport (L-CB6).
 * Adapters call this INSIDE their backend's native transaction so the
 * read -> check -> apply -> persist sequence is atomic.
 */
import { applyCommand } from '../domain/reducer';
import type { DomainEnv, GameCommand, GameState } from '../domain/types';
import type { CommandResult } from './game-transport';

export interface CasOutcome {
  readonly result: CommandResult;
  /** The state to persist, present only when the command was accepted and mutated. */
  readonly next?: GameState;
}

export function runCas(
  state: GameState | undefined,
  command: GameCommand,
  env: DomainEnv,
): CasOutcome {
  if (state === undefined) {
    return { result: { accepted: false, revision: 0, rejection: 'UNKNOWN_COMMAND' } };
  }
  // Idempotent duplicate: accept without mutating (I-CB16).
  if (state.recentCommandIds.includes(command.commandId)) {
    return { result: { accepted: true, revision: state.revision } };
  }
  // CAS guard: exactly one command wins at a given revision (I-CB17).
  if (state.revision !== command.expectedRevision) {
    return { result: { accepted: false, revision: state.revision, rejection: 'STALE_REVISION' } };
  }
  const applied = applyCommand(state, command, env);
  if (!applied.accepted) {
    return { result: { accepted: false, revision: state.revision, rejection: applied.rejection! } };
  }
  return { result: { accepted: true, revision: applied.state.revision }, next: applied.state };
}
