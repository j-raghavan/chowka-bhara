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
import type { Coord, GameState, LegalMove, Pawn, PlayerSide } from '../domain/types';

const SIDES: PlayerSide[] = ['south', 'east', 'north', 'west'];

interface Occupant {
  readonly pawnId: string;
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
      pawnId: pawn.id,
      color: player.color,
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
  const [selected, setSelected] = useState<string | null>(null);
  const occupants = buildOccupants(state);

  // Color of each seated side (their chosen pawn color), fallback to the default.
  const sideColor: Partial<Record<PlayerSide, string>> = {};
  for (const player of Object.values(state.players)) sideColor[player.side] = player.color;

  // Legal moves grouped by pawn; a pawn is "movable" if it has at least one.
  const movesByPawn = new Map<string, LegalMove[]>();
  if (interactive) {
    for (const move of state.legalMoves) {
      const list = movesByPawn.get(move.pawnId) ?? [];
      list.push(move);
      movesByPawn.set(move.pawnId, list);
    }
  }
  const movable = movesByPawn;
  // Auto-select when exactly one pawn can move; otherwise honour the click.
  const effectiveSelected =
    selected !== null && movable.has(selected)
      ? selected
      : movable.size === 1
        ? [...movable.keys()][0]!
        : null;
  const selectedMoves = effectiveSelected ? (movable.get(effectiveSelected) ?? []) : [];

  // Destination cells for the selected pawn.
  const destByCell = new Map<string, LegalMove>();
  for (const move of selectedMoves) destByCell.set(coordKey(move.to), move);

  // Preview trail for the selected pawn's (single) destination.
  const previewKeys = new Set<string>();
  const previewMove = selectedMoves[0];
  if (previewMove) {
    const side = state.players[previewMove.playerId]?.side;
    if (side) {
      for (const c of pathTrail(side, previewMove.fromIndex ?? 0, previewMove.toIndex)) {
        previewKeys.add(coordKey(c));
      }
    }
  }

  // Home pawns grouped by side (shown in each side's home base).
  const homeBySide: Partial<Record<PlayerSide, Pawn[]>> = {};
  for (const pawn of Object.values(state.pawns)) {
    if (pawn.state !== 'home') continue;
    const side = state.players[pawn.playerId]?.side;
    if (side === undefined) continue;
    (homeBySide[side] ??= []).push(pawn);
  }

  const rows: Coord[][] = Array.from({ length: 7 }, (_unused, r) =>
    Array.from({ length: 7 }, (_u, c) => [r, c] as Coord),
  );

  const selectPawn = (pawnId: string): void => setSelected(pawnId);

  return (
    <div className="board-area">
      {SIDES.map((side) => (
        <div
          key={side}
          className={`home-base ${side}`}
          role="group"
          aria-label={`${side} home base`}
        >
          {(homeBySide[side] ?? []).map((pawn) => {
            const canEnter = interactive && movable.has(pawn.id);
            const isSel = effectiveSelected === pawn.id;
            const color = sideColor[side] ?? SIDE_COLORS[side];
            return canEnter ? (
              <button
                key={pawn.id}
                type="button"
                className={'home-pawn selectable' + (isSel ? ' selected' : '')}
                style={{ background: color }}
                aria-label={`Select home pawn to enter (${side})`}
                aria-pressed={isSel}
                onClick={() => selectPawn(pawn.id)}
              />
            ) : (
              <span
                key={pawn.id}
                className="home-pawn"
                style={{ background: color }}
                aria-hidden="true"
              />
            );
          })}
        </div>
      ))}

      <div className="board-frame">
        <div className="board-grid" role="grid" aria-label="Chowka Bhara board">
          {rows.map((row, r) => (
            <div key={`row-${r}`} role="row" style={{ display: 'contents' }}>
              {row.map((coord) => {
                const key = coordKey(coord);
                const role = houseRole(coord);
                const occupant = occupants.get(key);
                const dest = destByCell.get(key);
                const occMovable = occupant !== undefined && movable.has(occupant.pawnId);
                const isSelectedPawnCell =
                  occupant !== undefined && occupant.pawnId === effectiveSelected;
                const isSafeTile = role !== 'path';
                const bg = isSafeTile ? SAFE_LIME : tileShade(coord);
                const glyphSide = role === 'start' ? startSide(coord) : null;

                // A cell is interactive if it's the selected pawn's destination (apply)
                // or it holds a movable active pawn (select).
                const onActivate =
                  dest && onSelectMove
                    ? () => onSelectMove(dest.id)
                    : interactive && occMovable
                      ? () => selectPawn(occupant!.pawnId)
                      : undefined;

                const className =
                  'house' +
                  (dest ? ' legal' : '') +
                  (dest?.wouldHitPawnId ? ' hit' : '') +
                  (previewKeys.has(key) ? ' preview' : '') +
                  (occMovable && !dest ? ' selectable' : '') +
                  (isSelectedPawnCell ? ' selected' : '');

                const title = dest?.wouldHitPawnId
                  ? 'Hit — sends the opponent home'
                  : isSafeTile && occupant
                    ? 'Safe house — this pawn is protected; stacking is not allowed'
                    : undefined;

                return (
                  <div
                    key={key}
                    role="gridcell"
                    aria-label={`${role} house ${key}${occupant ? `, occupied by ${occupant.label}` : ''}${dest ? ', legal move' : occMovable ? ', selectable pawn' : ''}`}
                    className={className}
                    title={title}
                    style={{ background: bg, borderColor: isSafeTile ? SAFE_LIME_DEEP : undefined }}
                    tabIndex={onActivate ? 0 : -1}
                    onClick={onActivate}
                    onKeyDown={
                      onActivate
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onActivate();
                            }
                          }
                        : undefined
                    }
                  >
                    {role === 'center' && <CrownGlyph />}
                    {role === 'start' && glyphSide && (
                      <PawnGlyph color={sideColor[glyphSide] ?? SIDE_COLORS[glyphSide]} />
                    )}
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
          ))}
        </div>
      </div>
    </div>
  );
}
