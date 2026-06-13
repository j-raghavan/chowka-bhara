import { useState } from 'react';
import { Board } from '../components/Board';
import { CowrieRoll } from '../components/CowrieRoll';
import { PlayerPanel } from '../components/PlayerPanel';
import { GameHistory } from '../components/GameHistory';
import { RulesPanel } from '../components/RulesPanel';
import { TurnBanner } from '../components/TurnBanner';
import type { RoomView } from '../app/useRoom';
import type { CowrieFace } from '../domain/types';

const SKIP_TEXT: Record<string, string> = {
  'start-blocked': 'your start house was blocked',
  'all-targets-blocked': 'no pawn could move',
  'inner-path-locked': 'you must hit an opponent before entering the inner rings',
  'would-overshoot': 'every move would overshoot the center',
  mixed: 'no legal move was available',
};

export function GamePage({ room }: { room: RoomView }) {
  const { state, me, isMyTurn } = room;
  const [showRules, setShowRules] = useState(false);
  if (state === null) return null;

  const playing = state.status === 'playing';
  const canRoll =
    playing && isMyTurn && state.currentRoll === null && state.winnerPlayerId === null;
  const interactive = playing && isMyTurn;

  // The faces to display: the live roll, or the last roll from history so the throw
  // is always visible — even when a no-move roll auto-skipped (clearing currentRoll).
  const lastRoll = [...state.history].reverse().find((e) => e.type === 'ROLL');
  const shownFaces =
    state.currentRoll?.faces ?? (lastRoll?.data?.['faces'] as CowrieFace[] | undefined) ?? null;
  const rollIsLive = state.currentRoll !== null;

  // Surface the most recent skip for the local player (CB6-FR12).
  const lastSkip = [...state.history].reverse().find((e) => e.type === 'SKIP');
  const myPawnsAllHome =
    me !== null &&
    Object.values(state.pawns)
      .filter((p) => p.playerId === me.playerId)
      .every((p) => p.state === 'home');
  let mySkip =
    lastSkip && lastSkip.playerId === me?.playerId && state.currentRoll === null
      ? SKIP_TEXT[String(lastSkip.data?.['reason'])]
      : undefined;
  if (mySkip && myPawnsAllHome) mySkip = 'roll a 1 to bring a pawn onto the board';

  return (
    <div className="app-shell">
      <TurnBanner state={state} />
      {mySkip && (
        <div className="turn-banner" style={{ background: 'rgba(255,180,80,0.25)' }}>
          Skipped: {mySkip}.
        </div>
      )}
      <div className="game-layout">
        <Board state={state} interactive={interactive} onSelectMove={room.selectMove} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="panel">
            <h2>{isMyTurn ? 'Your turn' : me?.spectator ? 'Spectating' : 'Waiting…'}</h2>
            <CowrieRoll faces={shownFaces} live={rollIsLive} canRoll={canRoll} onRoll={room.roll} />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn secondary" onClick={() => setShowRules((v) => !v)}>
                {showRules ? 'Hide rules' : 'Rules'}
              </button>
              <button
                className="btn secondary"
                onClick={room.resign}
                disabled={!playing || !!me?.spectator}
              >
                Resign
              </button>
              <button className="btn" onClick={room.goHome}>
                Leave
              </button>
            </div>
          </div>
          <PlayerPanel state={state} />
          {showRules && <RulesPanel />}
          <GameHistory state={state} />
        </div>
      </div>
    </div>
  );
}
