import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { Board } from '../../src/components/Board';
import { HomePage } from '../../src/pages/HomePage';
import { applyCommand } from '../../src/domain/reducer';
import { commandFactory } from '../helpers/commands';
import { envForRolls } from '../helpers/env';
import { makePlayingState, withPawnAt } from '../helpers/state';

const cmd = commandFactory();

function playingStateWithMoves() {
  let s = makePlayingState({ sides: ['south', 'north'], pawnsPerPlayer: 1 });
  s = withPawnAt(s, 'south-p0', 6);
  s = withPawnAt(s, 'north-p0', 21);
  return applyCommand(s, cmd({ type: 'ROLL', playerId: 'south' }), envForRolls([3])).state;
}

// jsdom can't compute layout, so axe skips color-contrast; this gates ARIA/roles/labels.
describe('accessibility (axe) — CB6-FR10/FR11', () => {
  it('the board has no ARIA violations (valid grid > row > gridcell)', async () => {
    const { container } = render(<Board state={playingStateWithMoves()} />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('the home screen has no ARIA violations', async () => {
    const { container } = render(<HomePage onCreate={() => {}} />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
