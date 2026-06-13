import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CowrieRoll } from '../../src/components/CowrieRoll';
import { facesForValue } from '../../src/domain/cowries';
import type { RollValue } from '../../src/domain/types';

const faces = (v: RollValue) => [...facesForValue(v)];

describe('CowrieRoll value display', () => {
  it('shows the value derived from the live thrown faces', () => {
    render(<CowrieRoll faces={faces(3)} live={true} canRoll={false} onRoll={() => {}} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText(/last roll/i)).toBeNull();
  });

  it('renders the actual faces: 2 open shells score 2', () => {
    const { container } = render(
      <CowrieRoll faces={faces(2)} live canRoll={false} onRoll={() => {}} />,
    );
    expect(container.querySelectorAll('.cowrie.open')).toHaveLength(2);
    expect(container.querySelectorAll('.cowrie.closed')).toHaveLength(4);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows the last roll value (with a hint) after a no-move skip', () => {
    render(<CowrieRoll faces={faces(5)} live={false} canRoll={true} onRoll={() => {}} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/last roll/i)).toBeInTheDocument();
  });

  it('names Chowka (6) and Bhara (12)', () => {
    const { rerender } = render(
      <CowrieRoll faces={faces(6)} live canRoll={false} onRoll={() => {}} />,
    );
    expect(screen.getByText('Chowka')).toBeInTheDocument();
    rerender(<CowrieRoll faces={faces(12)} live canRoll={false} onRoll={() => {}} />);
    expect(screen.getByText('Bhara')).toBeInTheDocument();
  });

  it('shows a dash and disables rolling when there is no roll', () => {
    const onRoll = vi.fn();
    render(<CowrieRoll faces={null} live={false} canRoll={false} onRoll={onRoll} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /roll cowries/i })).toBeDisabled();
  });
});
