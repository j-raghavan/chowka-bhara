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

  it('click the home square then the destination to bring a pawn out (#2)', () => {
    const state = entryRoll();
    const onSelectMove = vi.fn();
    const { container } = render(<Board state={state} onSelectMove={onSelectMove} />);

    // The home/start square is selectable (4 home pawns can enter); nothing highlighted yet.
    const homeCell = container.querySelector('[aria-label^="start house 6,3"]')!;
    expect(homeCell).toHaveClass('selectable');
    expect(container.querySelector('.house.legal')).toBeNull();

    fireEvent.click(homeCell); // select a home pawn
    const dest = container.querySelector('.house.legal'); // entry destination now highlighted
    expect(dest).not.toBeNull();
    fireEvent.click(dest!);
    expect(onSelectMove).toHaveBeenCalledTimes(1);
    const moveId = onSelectMove.mock.calls[0]![0] as string;
    expect(state.legalMoves.find((m) => m.id === moveId)?.type).toBe('enter');
  });

  it('lets the player choose any movable on-board pawn each turn (#2)', () => {
    let s = makePlayingState({ sides: ['south', 'north'] });
    s = withPawnAt(s, 'south-p0', 5); // [4,6]
    s = withPawnAt(s, 'south-p1', 10); // [0,5]
    s = applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), envForRolls([2])).state;
    const onSelectMove = vi.fn();
    const { container } = render(<Board state={s} onSelectMove={onSelectMove} />);

    // Two movable pawns -> nothing auto-selected -> both cells are selectable.
    expect(container.querySelector('.house.legal')).toBeNull();
    const selectables = [...container.querySelectorAll('.house.selectable')];
    expect(selectables).toHaveLength(2);

    // Pick the second pawn and move it (not forced to the first).
    fireEvent.click(selectables[1]!);
    const dest = container.querySelector('.house.legal');
    expect(dest).not.toBeNull();
    fireEvent.click(dest!);
    expect(onSelectMove).toHaveBeenCalledTimes(1);
  });

  it('renders no interactive cells when not interactive', () => {
    const { container } = render(<Board state={entryRoll()} interactive={false} />);
    expect(container.querySelector('.house.legal')).toBeNull();
    expect(container.querySelector('.house.selectable')).toBeNull();
  });
});
