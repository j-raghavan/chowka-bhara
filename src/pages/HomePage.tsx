import { useMemo, useState } from 'react';
import { Board } from '../components/Board';
import { createInitialState } from '../domain/game-setup';
import { makeProductionEnv } from '../app/env';
import type { GameState } from '../domain/types';

export interface HomePageProps {
  readonly onStart: (playerCount: number, hostName: string) => void;
}

export function HomePage({ onStart }: HomePageProps) {
  const [name, setName] = useState('');
  const demo: GameState = useMemo(
    () => createInitialState({ gameId: 'demo', hostId: 'demo', hostName: 'demo' }, makeProductionEnv()),
    [],
  );

  return (
    <div className="home">
      <h1>Chowka Bhara</h1>
      <p className="tagline">The traditional 7×7 board game — for 2 to 4 players, in your browser.</p>

      <div className="home-board">
        <Board state={demo} interactive={false} />
        <img
          src={`${import.meta.env.BASE_URL}board-reference.jpg`}
          alt="Handmade Chowka Bhara board"
          style={{ display: 'none' }}
          onLoad={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'block';
            (e.currentTarget as HTMLImageElement).style.width = '100%';
            (e.currentTarget as HTMLImageElement).style.borderRadius = '12px';
            (e.currentTarget as HTMLImageElement).style.marginTop = '1rem';
          }}
        />
      </div>

      <div className="home-actions">
        <input
          aria-label="Your name"
          placeholder="Your name"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" onClick={() => onStart(2, name)}>
          Play 2 players
        </button>
        <button className="btn secondary" onClick={() => onStart(3, name)}>
          3 players
        </button>
        <button className="btn secondary" onClick={() => onStart(4, name)}>
          4 players
        </button>
      </div>
    </div>
  );
}
