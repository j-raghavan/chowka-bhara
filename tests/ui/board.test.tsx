import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { Board } from '../../src/components/Board';
import { applyCommand } from '../../src/domain/reducer';
import { commandFactory } from '../helpers/commands';
import { envForRolls } from '../helpers/env';
import { makePlayingState, withPawnAt } from '../helpers/state';

const cmd = commandFactory();

/** A state where south has exactly one legal move: a hit on the non-safe [3,6]. */
function oneHitMove() {
  let s = makePlayingState({ sides: ['south', 'north'], pawnsPerPlayer: 1 });
  s = withPawnAt(s, 'south-p0', 3);
  s = withPawnAt(s, 'north-p0', 18); // resolves to [3,6]
  return applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), envForRolls([3])).state;
}

/** A state where south just rolled a 1 with all pawns home (4 entry moves). */
function entryRoll() {
  const s = makePlayingState({ sides: ['south', 'north'] });
  return applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), envForRolls([1])).state;
}

describe('Board interactivity', () => {
  it('auto-selects the only movable pawn and activates its destination', () => {
    const state = oneHitMove();
    const onSelectMove = vi.fn();
    const { container } = render(<Board state={state} onSelectMove={onSelectMove} />);

    const dest = container.querySelector('.house.legal');
    expect(dest).not.toBeNull();
    expect(dest).toHaveClass('hit');
    expect(dest).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(dest!, { key: 'Enter' });
    expect(onSelectMove).toHaveBeenCalledWith(state.legalMoves[0]!.id);
  });

  it('leaves empty, non-selectable cells non-interactive', () => {
    const { container } = render(<Board state={oneHitMove()} />);
    const inert = Array.from(container.querySelectorAll('.house')).find(
      (c) => !c.classList.contains('legal') && !c.classList.contains('selectable'),
    )!;
    expect(inert).toHaveAttribute('tabindex', '-1');
  });

  it('stacks home pawns on each side home/start square', () => {
    const { container } = render(<Board state={entryRoll()} interactive={false} />);
    // South's home square [6,3] holds all 4 home pawns -> a ×4 stack badge.
    const southHome = container.querySelector('[aria-label^="start house 6,3"] .pawn');
    expect(southHome?.textContent).toBe('×4');
  });

  it('auto-highlights an entry destination so a home pawn can come out (#2)', () => {
    const state = entryRoll();
    const onSelectMove = vi.fn();
    const { container } = render(<Board state={state} onSelectMove={onSelectMove} />);

    // A movable home pawn is auto-selected so its entry destination is highlighted
    // and clickable straight away — the board is never "stuck".
    const dest = container.querySelector('.house.legal');
    expect(dest).not.toBeNull();
    fireEvent.click(dest!);
    expect(onSelectMove).toHaveBeenCalledTimes(1);
    const moveId = onSelectMove.mock.calls[0]![0] as string;
    expect(state.legalMoves.find((m) => m.id === moveId)?.type).toBe('enter');
  });

  it('lets the player switch to another movable pawn before moving (#2)', () => {
    let s = makePlayingState({ sides: ['south', 'north'] });
    s = withPawnAt(s, 'south-p0', 5); // [4,6]
    s = withPawnAt(s, 'south-p1', 10); // [0,5]
    s = applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), envForRolls([2])).state;
    const onSelectMove = vi.fn();
    const { container } = render(<Board state={s} onSelectMove={onSelectMove} />);

    // One pawn is auto-selected (a destination is always highlighted -> never stuck);
    // the other movable pawn is offered as a switch.
    expect(container.querySelector('.house.legal')).not.toBeNull();
    const autoPawn = s.legalMoves[0]!.pawnId;
    const selectable = container.querySelector('.house.selectable');
    expect(selectable).not.toBeNull();

    // Switch to the other pawn and move it (the player is not forced onto the default).
    fireEvent.click(selectable!);
    const dest = container.querySelector('.house.legal');
    expect(dest).not.toBeNull();
    fireEvent.click(dest!);
    expect(onSelectMove).toHaveBeenCalledTimes(1);
    const moveId = onSelectMove.mock.calls[0]![0] as string;
    expect(s.legalMoves.find((m) => m.id === moveId)?.pawnId).not.toBe(autoPawn);
  });

  it('renders no interactive cells when not interactive', () => {
    const { container } = render(<Board state={entryRoll()} interactive={false} />);
    expect(container.querySelector('.house.legal')).toBeNull();
    expect(container.querySelector('.house.selectable')).toBeNull();
  });
});
