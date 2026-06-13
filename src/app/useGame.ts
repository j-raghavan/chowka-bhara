import { useCallback, useRef, useState } from 'react';
import { FakeTransport } from '../transport/fake-transport';
import { GameService } from './services/game-service';
import { makeProductionEnv } from './env';
import type { GameState } from '../domain/types';

interface Session {
  readonly transport: FakeTransport;
  readonly service: GameService;
  readonly gameId: string;
  readonly playerIds: string[];
}

/**
 * Local (hotseat) game session backed by the in-memory FakeTransport. Each
 * turn the UI acts as whichever player is current. Online play with separate
 * browsers swaps FakeTransport for a real GameTransport adapter (CB5-prod).
 */
export function useGame() {
  const [state, setState] = useState<GameState | null>(null);
  const session = useRef<Session | null>(null);

  const startLocal = useCallback(async (playerCount: number, hostName: string) => {
    const env = makeProductionEnv();
    const transport = new FakeTransport(env);
    const service = new GameService(transport, env);
    const created = await service.createRoom(hostName || 'Player 1');
    const playerIds = [created.playerId];
    for (let i = 2; i <= playerCount; i++) {
      const join = await service.joinRoom(created.gameId, `Player ${i}`);
      playerIds.push(join.playerId);
    }
    transport.subscribeRoom(created.gameId, setState);
    session.current = { transport, service, gameId: created.gameId, playerIds };
    await service.start(created.gameId, created.playerId);
  }, []);

  const actAsCurrent = useCallback(
    async (fn: (s: Session, playerId: string) => Promise<unknown>) => {
      const s = session.current;
      const current = state?.currentPlayerId;
      if (s && current) await fn(s, current);
    },
    [state],
  );

  const roll = useCallback(
    () => actAsCurrent((s, pid) => s.service.roll(s.gameId, pid)),
    [actAsCurrent],
  );
  const selectMove = useCallback(
    (moveId: string) => actAsCurrent((s, pid) => s.service.selectMove(s.gameId, pid, moveId)),
    [actAsCurrent],
  );
  const resign = useCallback(
    () => actAsCurrent((s, pid) => s.service.resign(s.gameId, pid)),
    [actAsCurrent],
  );
  const reset = useCallback(() => {
    session.current = null;
    setState(null);
  }, []);

  return { state, startLocal, roll, selectMove, resign, reset };
}
