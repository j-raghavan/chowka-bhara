import { useState } from 'react';
import { coordAt } from '../domain/paths';
import { coordKey } from '../domain/board';
import { pathTrail } from '../domain/selectors';
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
}

function buildOccupants(state: GameState): Map<string, Occupant> {
  const map = new Map<string, Occupant>();
  for (const pawn of Object.values(state.pawns)) {
    if (pawn.state !== 'active' || pawn.pathIndex === null) continue;
    const player = state.players[pawn.playerId];
    if (player === undefined) continue;
    map.set(coordKey(coordAt(player.side, pawn.pathIndex)), {
      color: SIDE_COLORS[player.side],
      label: player.side[0]!.toUpperCase(),
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
  const [hovered, setHovered] = useState<string | null>(null);
  const occupants = buildOccupants(state);
  const legalByCell = new Map<string, LegalMove>();
  if (interactive) for (const move of state.legalMoves) legalByCell.set(coordKey(move.to), move);

  // Preview trail for the hovered/focused legal move (CB6-FR6).
  const previewKeys = new Set<string>();
  const hoveredMove = state.legalMoves.find((m) => m.id === hovered);
  if (interactive && hoveredMove) {
    const side = state.players[hoveredMove.playerId]?.side;
    if (side) {
      const from = hoveredMove.fromIndex ?? 0;
      for (const coord of pathTrail(side, from, hoveredMove.toIndex))
        previewKeys.add(coordKey(coord));
    }
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
            (legal?.wouldHitPawnId ? ' hit' : '') +
            (previewKeys.has(key) ? ' preview' : '');

          const title = legal?.wouldHitPawnId
            ? 'Hit — sends the opponent home'
            : isSafeTile && occupant
              ? 'Safe house — this pawn is protected; stacking is not allowed'
              : undefined;

          const activate = legal && onSelectMove ? () => onSelectMove(legal.id) : undefined;

          return (
            <div
              key={key}
              role="gridcell"
              aria-label={`${role} house ${key}${occupant ? `, occupied by ${occupant.label}` : ''}${legal ? ', legal move' : ''}`}
              className={className}
              title={title}
              style={{ background: bg, borderColor: isSafeTile ? SAFE_LIME_DEEP : undefined }}
              tabIndex={legal ? 0 : -1}
              onClick={activate}
              onMouseEnter={legal ? () => setHovered(legal.id) : undefined}
              onMouseLeave={legal ? () => setHovered(null) : undefined}
              onFocus={legal ? () => setHovered(legal.id) : undefined}
              onBlur={legal ? () => setHovered(null) : undefined}
              onKeyDown={
                activate
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        activate();
                      }
                    }
                  : undefined
              }
            >
              {role === 'center' && <CrownGlyph />}
              {role === 'start' && side && <PawnGlyph color={SIDE_COLORS[side]} />}
              {role === 'safe' && (
                <span className="mark-x" aria-hidden="true">
                  ×
                </span>
              )}
              {occupant && (
                <span className="pawn" style={{ background: occupant.color }}>
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
