import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { Board } from '../../src/components/Board';
import { applyCommand } from '../../src/domain/reducer';
import { commandFactory } from '../helpers/commands';
import { envForRolls } from '../helpers/env';
import { makePlayingState, withPawnAt } from '../helpers/state';

const cmd = commandFactory();

/** A state where south has exactly one legal move: a hit on [0,6]. */
function stateWithOneHitMove() {
  let s = makePlayingState({ sides: ['south', 'north'], pawnsPerPlayer: 1 });
  s = withPawnAt(s, 'south-p0', 6);
  s = withPawnAt(s, 'north-p0', 21); // [0,6]
  const rolled = applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), envForRolls([3]));
  return rolled.state;
}

describe('Board interactivity (CB6-FR5, CB6-AC1)', () => {
  it('makes only legal cells interactive and keyboard-activatable', () => {
    const state = stateWithOneHitMove();
    const onSelectMove = vi.fn();
    const { container } = render(<Board state={state} onSelectMove={onSelectMove} />);

    const legalCell = container.querySelector('.house.legal');
    expect(legalCell).not.toBeNull();
    expect(legalCell).toHaveClass('hit'); // it is a hit move
    expect(legalCell).toHaveAttribute('tabindex', '0');

    // A non-legal cell is structurally inert.
    const cells = Array.from(container.querySelectorAll('.house'));
    const illegal = cells.find((c) => !c.classList.contains('legal'))!;
    expect(illegal).toHaveAttribute('tabindex', '-1');

    // Enter activates the legal move with the reducer's move id.
    fireEvent.keyDown(legalCell!, { key: 'Enter' });
    expect(onSelectMove).toHaveBeenCalledWith(state.legalMoves[0]!.id);

    // Click also activates it.
    fireEvent.click(legalCell!);
    expect(onSelectMove).toHaveBeenCalledTimes(2);
  });

  it('renders no interactive cells when not interactive', () => {
    const state = stateWithOneHitMove();
    const { container } = render(<Board state={state} interactive={false} />);
    expect(container.querySelector('.house.legal')).toBeNull();
  });
});
