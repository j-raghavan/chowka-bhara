import { useEffect, useState } from 'react';
import { coordAt } from '../domain/paths';
import { coordKey, HOME_MARKER_INDEX } from '../domain/board';
import { pathTrail } from '../domain/selectors';
import { houseRole, SAFE_LIME, SAFE_LIME_DEEP, startSide, tileShade } from '../ui/board-theme';
import { CrownGlyph, PawnGlyph } from './glyphs';
import type { Coord, GameState, LegalMove, PlayerSide } from '../domain/types';

interface Occupant {
  readonly pawnId: string;
  readonly color: string;
  readonly label: string;
}

/**
 * Occupants per cell. Home pawns sit on their side's home/start square
 * (index 0); active pawns on their resolved cell. Safe houses (and the home
 * square) may hold several pawns (stacking).
 */
function buildOccupants(state: GameState): Map<string, Occupant[]> {
  const map = new Map<string, Occupant[]>();
  for (const pawn of Object.values(state.pawns)) {
    const player = state.players[pawn.playerId];
    if (player === undefined) continue;
    let index: number;
    if (pawn.state === 'active' && pawn.pathIndex !== null) index = pawn.pathIndex;
    else if (pawn.state === 'home')
      index = HOME_MARKER_INDEX; // the home/start square
    else continue; // finished pawns aren't drawn on the board
    const key = coordKey(coordAt(player.side, index));
    const occupant: Occupant = {
      pawnId: pawn.id,
      color: player.color,
      label: player.side[0]!.toUpperCase(),
    };
    const list = map.get(key);
    if (list === undefined) map.set(key, [occupant]);
    else list.push(occupant);
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

  // #2: clear the selection at the start of each turn so any movable pawn can be
  // chosen freely (the selection must not stick to the last-moved pawn).
  const rollId = state.currentRoll?.id ?? null;
  useEffect(() => setSelected(null), [rollId]);

  const occupants = buildOccupants(state);

  // Color of each seated side (their chosen pawn color), fallback to the default.
  const sideColor: Partial<Record<PlayerSide, string>> = {};
  for (const player of Object.values(state.players)) sideColor[player.side] = player.color;

  // Legal moves grouped by pawn; a pawn is "movable" if it has at least one.
  const movable = new Map<string, LegalMove[]>();
  if (interactive) {
    for (const move of state.legalMoves) {
      const list = movable.get(move.pawnId) ?? [];
      list.push(move);
      movable.set(move.pawnId, list);
    }
  }
  // Always default to the first movable pawn so a destination is highlighted and
  // clickable — the board must never look "stuck" when a legal move exists. The
  // player can still tap any other movable pawn to switch to it before moving.
  const movableIds = [...movable.keys()];
  const effectiveSelected =
    selected !== null && movable.has(selected) ? selected : (movableIds[0] ?? null);
  const selectedMoves = effectiveSelected ? (movable.get(effectiveSelected) ?? []) : [];

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

  const rows: Coord[][] = Array.from({ length: 7 }, (_unused, r) =>
    Array.from({ length: 7 }, (_u, c) => [r, c] as Coord),
  );

  return (
    <div className="board-area">
      <div className="board-frame">
        <div className="board-grid" role="grid" aria-label="Chowka Bhara board">
          {rows.map((row, r) => (
            <div key={`row-${r}`} role="row" style={{ display: 'contents' }}>
              {row.map((coord) => {
                const key = coordKey(coord);
                const role = houseRole(coord);
                const here = occupants.get(key) ?? [];
                const dest = destByCell.get(key);
                const movableHere = here.filter((o) => movable.has(o.pawnId)).map((o) => o.pawnId);
                const isSelectedPawnCell = here.some((o) => o.pawnId === effectiveSelected);
                const isSafeTile = role !== 'path';
                const bg = isSafeTile ? SAFE_LIME : tileShade(coord);
                const glyphSide = role === 'start' ? startSide(coord) : null;
                // Show the selected pawn's color if it's on this cell, else the top one.
                const shown = here.find((o) => o.pawnId === effectiveSelected) ?? here[0];

                // Cell is interactive if it's the selected pawn's destination (apply) or
                // it holds movable pawn(s) (select / cycle through them).
                const selectHere = (): void => {
                  const i = movableHere.indexOf(effectiveSelected ?? '');
                  setSelected(movableHere[(i + 1) % movableHere.length]!);
                };
                const onActivate =
                  dest && onSelectMove
                    ? () => onSelectMove(dest.id)
                    : interactive && movableHere.length > 0
                      ? selectHere
                      : undefined;

                const className =
                  'house' +
                  (dest ? ' legal' : '') +
                  (dest?.wouldHitPawnId ? ' hit' : '') +
                  (previewKeys.has(key) ? ' preview' : '') +
                  (movableHere.length > 0 && !dest && !isSelectedPawnCell ? ' selectable' : '') +
                  (isSelectedPawnCell ? ' selected' : '');

                const title = dest?.wouldHitPawnId
                  ? 'Hit — sends the opponent home'
                  : isSafeTile
                    ? 'Safe house — pawns here are protected and may share the square'
                    : undefined;

                return (
                  <div
                    key={key}
                    role="gridcell"
                    aria-label={`${role} house ${key}${here.length ? `, ${here.length} pawn(s)` : ''}${dest ? ', legal move' : movableHere.length ? ', selectable pawn' : ''}`}
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
                    {role === 'start' && glyphSide && sideColor[glyphSide] && here.length === 0 && (
                      <PawnGlyph color={sideColor[glyphSide]} />
                    )}
                    {role === 'safe' && (
                      <span className="mark-x" aria-hidden="true">
                        ×
                      </span>
                    )}
                    {shown && (
                      <span className="pawn" style={{ background: shown.color }}>
                        {here.length > 1 ? `×${here.length}` : shown.label}
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
