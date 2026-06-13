import { SIDE_COLORS, SIDE_LABEL } from '../ui/board-theme';
import type { GameState, Pawn } from '../domain/types';

function countBy(pawns: Pawn[], state: Pawn['state']): number {
  return pawns.filter((p) => p.state === state).length;
}

export function PlayerPanel({ state }: { state: GameState }) {
  return (
    <div className="panel">
      <h2>Players</h2>
      {state.playerOrder.map((id) => {
        const player = state.players[id];
        if (player === undefined) return null;
        const pawns = Object.values(state.pawns).filter((p) => p.playerId === id);
        const isCurrent = state.currentPlayerId === id;
        return (
          <div key={id} className={'player-row' + (isCurrent ? ' current' : '')}>
            <span className="dot" style={{ background: SIDE_COLORS[player.side] }} />
            <span>
              <strong>{player.displayName}</strong>
              <br />
              <small>
                {SIDE_LABEL[player.side]}
                {player.status !== 'connected' ? ` · ${player.status}` : ''}
                {player.hasHit ? ' · hit ✓' : ''}
              </small>
            </span>
            <span className="home-pawns">
              🏠 {countBy(pawns, 'home')} · 🏁 {countBy(pawns, 'finished')}
            </span>
          </div>
        );
      })}
    </div>
  );
}
