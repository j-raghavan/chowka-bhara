import type { GameState } from '../domain/types';

export function TurnBanner({ state }: { state: GameState }) {
  if (state.winnerPlayerId) {
    const winner = state.players[state.winnerPlayerId];
    return <div className="turn-banner">🏆 {winner?.displayName ?? 'A player'} wins!</div>;
  }
  const current = state.currentPlayerId ? state.players[state.currentPlayerId] : undefined;
  const phase = state.currentRoll === null ? 'roll the cowries' : 'choose a highlighted move';
  return (
    <div className="turn-banner" aria-live="polite">
      {current ? `${current.displayName} — ${phase}` : 'Waiting…'}
    </div>
  );
}
