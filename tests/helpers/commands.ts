import type { CommandType, GameCommand } from '../../src/domain/types';

interface CmdInput {
  readonly type: CommandType;
  readonly playerId: string;
  readonly moveId?: string;
  readonly color?: string;
  readonly displayName?: string;
  readonly reclaimToken?: string;
  readonly commandId?: string;
  readonly expectedRevision?: number;
  readonly issuedAt?: number;
}

/** Sequential command-id factory so each command is unique. */
export function commandFactory(gameId = 'game-test') {
  let n = 0;
  return function cmd(input: CmdInput): GameCommand {
    return {
      commandId: input.commandId ?? `cmd-${n++}`,
      gameId,
      expectedRevision: input.expectedRevision ?? 0,
      issuedAt: input.issuedAt ?? 0,
      ...input,
    } as GameCommand;
  };
}
