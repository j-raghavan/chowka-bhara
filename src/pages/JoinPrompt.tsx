import { useState } from 'react';
import type { GameState } from '../domain/types';

export interface JoinPromptProps {
  readonly state: GameState;
  readonly onJoin: (name: string) => void;
}

export function JoinPrompt({ state, onJoin }: JoinPromptProps) {
  const [name, setName] = useState('');
  const full = state.playerOrder.length >= state.config.maxPlayers || state.status !== 'lobby';

  return (
    <div className="home">
      <h1>Join the game</h1>
      <p className="tagline">
        {full
          ? 'This room is full or already started — you can join as a spectator.'
          : `${state.playerOrder.length} of ${state.config.maxPlayers} players seated. Take a seat!`}
      </p>
      <form
        className="home-actions"
        onSubmit={(e) => {
          e.preventDefault();
          onJoin(name);
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
          {full ? 'Spectate' : 'Take a seat'}
        </button>
      </form>
    </div>
  );
}
