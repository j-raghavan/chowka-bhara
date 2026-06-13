import type { GameEvent, GameState } from '../domain/types';

function describe(event: GameEvent, state: GameState): string {
  const name = (id: string | null) => (id && state.players[id]?.displayName) || id || '';
  const who = name(event.playerId);
  switch (event.type) {
    case 'ROLL':
      return `${who} rolled ${event.data?.['value']}`;
    case 'MOVE':
      return `${who} moved a pawn`;
    case 'HIT':
      return `${who} hit ${name(String(event.data?.['victimPlayerId'] ?? ''))}`;
    case 'FINISH':
      return `${who} brought a pawn home 🏁`;
    case 'SKIP':
      return `${who} had no legal move (${event.data?.['reason']})`;
    case 'BONUS':
      return `${who} earned a bonus turn`;
    case 'TURN_ADVANCE':
      return `${who}'s turn`;
    case 'WIN':
      return `${who} wins! 🏆`;
    case 'START':
      return 'Game started';
    case 'JOIN':
      return `${who} joined`;
    case 'LEAVE':
      return `${who} left`;
    case 'RESIGN':
      return `${who} resigned`;
  }
}

export function GameHistory({ state }: { state: GameState }) {
  const events = [...state.history].slice(-40).reverse();
  return (
    <div className="panel">
      <h2>History</h2>
      <ul className="history" aria-live="polite">
        {events.map((e) => (
          <li key={e.id}>{describe(e, state)}</li>
        ))}
      </ul>
    </div>
  );
}
