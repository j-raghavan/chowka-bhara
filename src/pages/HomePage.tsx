import { useMemo, useState } from 'react';
import { Board } from '../components/Board';
import { createInitialState } from '../domain/game-setup';
import { makeProductionEnv } from '../app/env';
import type { GameState } from '../domain/types';

export interface HomePageProps {
  readonly onCreate: (name: string) => void;
}

export function HomePage({ onCreate }: HomePageProps) {
  const [name, setName] = useState('');
  const demo: GameState = useMemo(
    () =>
      createInitialState({ gameId: 'demo', hostId: 'demo', hostName: 'demo' }, makeProductionEnv()),
    [],
  );

  return (
    <div className="home">
      <h1>Chowka Bhara</h1>
      <p className="tagline">The traditional 7×7 board game — online, for 2 to 4 players.</p>

      <div className="home-board">
        <Board state={demo} interactive={false} />
        <img
          src={`${import.meta.env.BASE_URL}board-reference.jpg`}
          alt="Handmade Chowka Bhara board"
          style={{ display: 'none' }}
          onLoad={(e) => {
            const img = e.currentTarget;
            img.style.display = 'block';
            img.style.width = '100%';
            img.style.borderRadius = '12px';
            img.style.marginTop = '1rem';
          }}
        />
      </div>

      <form
        className="home-actions"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(name);
        }}
      >
        <input
          aria-label="Your name"
          placeholder="Your name"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" type="submit">
          Create a room
        </button>
      </form>
      <p className="tagline" style={{ marginTop: '0.8rem' }}>
        Create a room, then share its link. Friends open it to take a seat — or open it in a second
        browser tab to play yourself.
      </p>
    </div>
  );
}
