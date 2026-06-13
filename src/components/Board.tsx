import { coordAt } from '../domain/paths';
import { coordKey } from '../domain/board';
import {
  houseRole,
  SAFE_LIME,
  SAFE_LIME_DEEP,
  SIDE_COLORS,
  startSide,
  tileShade,
} from '../ui/board-theme';
import { CrownGlyph, PawnGlyph } from './glyphs';
import type { Coord, GameState, LegalMove } from '../domain/types';

interface Occupant {
  readonly color: string;
  readonly label: string;
  readonly finished: boolean;
}

function buildOccupants(state: GameState): Map<string, Occupant> {
  const map = new Map<string, Occupant>();
  for (const pawn of Object.values(state.pawns)) {
    if (pawn.state !== 'active' || pawn.pathIndex === null) continue;
    const player = state.players[pawn.playerId];
    if (player === undefined) continue;
    const coord = coordAt(player.side, pawn.pathIndex);
    map.set(coordKey(coord), {
      color: SIDE_COLORS[player.side],
      label: player.side[0]!.toUpperCase(),
      finished: false,
    });
  }
  return map;
}

export interface BoardProps {
  readonly state: GameState;
  readonly interactive?: boolean;
  readonly onSelectMove?: (moveId: string) => void;
}

export function Board({ state, interactive = true, onSelectMove }: BoardProps) {
  const occupants = buildOccupants(state);
  const legalByCell = new Map<string, LegalMove>();
  if (interactive) {
    for (const move of state.legalMoves) legalByCell.set(coordKey(move.to), move);
  }

  const cells: Coord[] = [];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) cells.push([r, c]);

  return (
    <div className="board-frame">
      <div className="board-grid" role="grid" aria-label="Chowka Bhara board">
        {cells.map((coord) => {
          const key = coordKey(coord);
          const role = houseRole(coord);
          const occupant = occupants.get(key);
          const legal = legalByCell.get(key);
          const isSafeTile = role !== 'path';
          const bg = isSafeTile ? SAFE_LIME : tileShade(coord);
          const side = role === 'start' ? startSide(coord) : null;

          const className =
            'house' +
            (legal ? ' legal' : '') +
            (legal?.wouldHitPawnId ? ' hit' : '');

          const label = `${role} house ${key}` + (occupant ? `, occupied by ${occupant.label}` : '');

          return (
            <div
              key={key}
              role="gridcell"
              aria-label={label}
              className={className}
              style={{ background: bg, borderColor: isSafeTile ? SAFE_LIME_DEEP : undefined }}
              tabIndex={legal ? 0 : -1}
              onClick={legal && onSelectMove ? () => onSelectMove(legal.id) : undefined}
              onKeyDown={
                legal && onSelectMove
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectMove(legal.id);
                      }
                    }
                  : undefined
              }
            >
              {role === 'center' && <CrownGlyph />}
              {role === 'start' && side && <PawnGlyph color={SIDE_COLORS[side]} />}
              {role === 'safe' && <span className="mark-x" aria-hidden="true">×</span>}
              {occupant && (
                <span
                  className={'pawn' + (occupant.finished ? ' finished' : '')}
                  style={{ background: occupant.color }}
                >
                  {occupant.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
