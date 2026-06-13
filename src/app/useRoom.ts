import { useCallback, useEffect, useRef, useState } from 'react';
import { createTransport } from '../config/public-config';
import { GameService } from './services/game-service';
import { makeProductionEnv } from './env';
import { loadIdentity, saveIdentity, type RoomIdentity } from './identity';
import { roomHash, useHashRoute, type Route } from './hash-route';
import { deriveTurnPhase } from '../domain/selectors';
import type { DomainEnv, GameState, TurnPhase } from '../domain/types';
import type { GameTransport } from '../transport/game-transport';

export interface RoomView {
  readonly route: Route;
  readonly ready: boolean;
  readonly state: GameState | null;
  readonly me: RoomIdentity | null;
  readonly phase: TurnPhase;
  readonly isHost: boolean;
  readonly isMyTurn: boolean;
  readonly needsJoin: boolean;
  readonly createRoom: (name: string) => Promise<void>;
  readonly joinAs: (name: string) => Promise<void>;
  readonly start: () => void;
  readonly roll: () => void;
  readonly selectMove: (moveId: string) => void;
  readonly resign: () => void;
  readonly setColor: (color: string) => void;
  readonly goHome: () => void;
}

/** Online room session: wires the configured transport to React. */
export function useRoom(): RoomView {
  const [route, navigate] = useHashRoute();
  const envRef = useRef<DomainEnv | null>(null);
  if (envRef.current === null) envRef.current = makeProductionEnv();
  const transportRef = useRef<GameTransport | null>(null);
  const serviceRef = useRef<GameService | null>(null);

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [me, setMe] = useState<RoomIdentity | null>(null);

  useEffect(() => {
    let live = true;
    void createTransport(envRef.current!).then((t) => {
      if (!live) return;
      transportRef.current = t;
      serviceRef.current = new GameService(t, envRef.current!);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || route.name !== 'room') {
      setState(null);
      setMe(null);
      return;
    }
    const transport = transportRef.current!;
    const gameId = route.gameId;
    const unsub = transport.subscribeRoom(gameId, setState);
    const stored = loadIdentity(gameId);
    if (stored !== null) {
      setMe(stored);
      // Re-announce presence / reclaim the seat after a refresh.
      void transport.joinRoom({
        gameId,
        displayName: stored.displayName,
        reclaimToken: stored.reclaimToken,
      });
    } else {
      setMe(null);
    }
    return () => unsub();
  }, [ready, route]);

  const createRoom = useCallback(
    async (name: string) => {
      const transport = transportRef.current;
      if (transport === null) return;
      const displayName = name.trim() || 'Player';
      const res = await transport.createRoom({ hostName: displayName });
      const identity: RoomIdentity = {
        gameId: res.gameId,
        playerId: res.playerId,
        reclaimToken: res.reclaimToken,
        displayName,
        spectator: false,
      };
      saveIdentity(identity);
      setMe(identity);
      navigate(roomHash(res.gameId));
    },
    [navigate],
  );

  const joinAs = useCallback(
    async (name: string) => {
      const transport = transportRef.current;
      if (transport === null || route.name !== 'room') return;
      const displayName = name.trim() || 'Player';
      const res = await transport.joinRoom({ gameId: route.gameId, displayName });
      const identity: RoomIdentity = {
        gameId: route.gameId,
        playerId: res.playerId,
        reclaimToken: res.reclaimToken,
        displayName,
        spectator: res.spectator,
      };
      if (!res.spectator) saveIdentity(identity);
      setMe(identity);
    },
    [route],
  );

  const act = useCallback(
    (fn: (svc: GameService, gameId: string, playerId: string) => void) => {
      const svc = serviceRef.current;
      if (svc !== null && state !== null && me !== null && !me.spectator) {
        fn(svc, state.gameId, me.playerId);
      }
    },
    [state, me],
  );

  const start = useCallback(() => act((svc, g, p) => void svc.start(g, p)), [act]);
  const roll = useCallback(() => act((svc, g, p) => void svc.roll(g, p)), [act]);
  const selectMove = useCallback(
    (moveId: string) => act((svc, g, p) => void svc.selectMove(g, p, moveId)),
    [act],
  );
  const resign = useCallback(() => act((svc, g, p) => void svc.resign(g, p)), [act]);
  const setColor = useCallback(
    (color: string) => act((svc, g, p) => void svc.setColor(g, p, color)),
    [act],
  );
  const goHome = useCallback(() => navigate('#/'), [navigate]);

  const isHost = state !== null && me !== null && state.hostId === me.playerId;
  const isMyTurn = state !== null && me !== null && state.currentPlayerId === me.playerId;
  const needsJoin = route.name === 'room' && state !== null && me === null;
  const phase = state === null ? 'idle' : deriveTurnPhase(state);

  return {
    route,
    ready,
    state,
    me,
    phase,
    isHost,
    isMyTurn,
    needsJoin,
    createRoom,
    joinAs,
    start,
    roll,
    selectMove,
    resign,
    setColor,
    goHome,
  };
}
