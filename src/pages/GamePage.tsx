import { useState } from 'react';
import { Board } from '../components/Board';
import { CowrieRoll } from '../components/CowrieRoll';
import { PlayerPanel } from '../components/PlayerPanel';
import { GameHistory } from '../components/GameHistory';
import { RulesPanel } from '../components/RulesPanel';
import { TurnBanner } from '../components/TurnBanner';
import type { GameState } from '../domain/types';

export interface GamePageProps {
  readonly state: GameState;
  readonly onRoll: () => void;
  readonly onSelectMove: (moveId: string) => void;
  readonly onResign: () => void;
  readonly onNewGame: () => void;
}

export function GamePage({ state, onRoll, onSelectMove, onResign, onNewGame }: GamePageProps) {
  const [showRules, setShowRules] = useState(false);
  const playing = state.status === 'playing';
  const canRoll = playing && state.currentRoll === null && state.winnerPlayerId === null;

  return (
    <div className="app-shell">
      <TurnBanner state={state} />
      <div className="game-layout">
        <Board state={state} interactive={playing} onSelectMove={onSelectMove} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="panel">
            <h2>Your turn</h2>
            <CowrieRoll roll={state.currentRoll} canRoll={canRoll} onRoll={onRoll} />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button className="btn secondary" onClick={() => setShowRules((v) => !v)}>
                {showRules ? 'Hide rules' : 'Rules'}
              </button>
              <button className="btn secondary" onClick={onResign} disabled={!playing}>
                Resign
              </button>
              <button className="btn" onClick={onNewGame}>
                New game
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
