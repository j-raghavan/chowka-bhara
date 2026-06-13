import { SIDE_COLORS, SIDE_LABEL } from '../ui/board-theme';
import type { GameState, Pawn } from '../domain/types';

const STATE_TITLE: Record<Pawn['state'], string> = {
  home: 'home (waiting to enter on a roll of 1)',
  active: 'on the board',
  finished: 'finished',
};

export function PlayerPanel({ state }: { state: GameState }) {
  return (
    <div className="panel">
      <h2>Players</h2>
      {state.playerOrder.map((id) => {
        const player = state.players[id];
        if (player === undefined) return null;
        const pawns = Object.values(state.pawns)
          .filter((p) => p.playerId === id)
          .sort((a, b) => a.id.localeCompare(b.id));
        const isCurrent = state.currentPlayerId === id;
        const finished = pawns.filter((p) => p.state === 'finished').length;
        return (
          <div key={id} className={'player-row' + (isCurrent ? ' current' : '')}>
            <span className="dot" style={{ background: SIDE_COLORS[player.side] }} />
            <span className="player-info">
              <strong>{player.displayName}</strong>
              <small>
                {SIDE_LABEL[player.side]}
                {player.status !== 'connected' ? ` · ${player.status}` : ''}
                {player.hasHit ? ' · hit ✓' : ''}
                {` · ${finished}/${pawns.length} home`}
              </small>
            </span>
            <span className="pawn-tray" aria-label={`${player.displayName}'s pawns`}>
              {pawns.map((p) => (
                <span
                  key={p.id}
                  className={`tray-pawn ${p.state}`}
                  style={{ background: SIDE_COLORS[player.side] }}
                  title={STATE_TITLE[p.state]}
                />
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
