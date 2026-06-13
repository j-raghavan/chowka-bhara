import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PlayerPanel } from '../../src/components/PlayerPanel';
import { makePlayingState } from '../helpers/state';

describe('PlayerPanel', () => {
  it('renders every pawn as a token (all four show per player)', () => {
    const state = makePlayingState({ sides: ['south', 'north'], pawnsPerPlayer: 4 });
    const { container } = render(<PlayerPanel state={state} />);
    // 2 players x 4 pawns = 8 tokens.
    expect(container.querySelectorAll('.tray-pawn')).toHaveLength(8);
  });

  it('pulses the pawn that was just knocked home (#8)', () => {
    const state = makePlayingState({ sides: ['south', 'north'] });
    const { container } = render(<PlayerPanel state={state} recentHitPawnId="north-p0" />);
    const pulsing = container.querySelectorAll('.tray-pawn.just-home');
    expect(pulsing).toHaveLength(1);
  });
});
