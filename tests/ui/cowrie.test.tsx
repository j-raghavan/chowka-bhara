import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CowrieRoll } from '../../src/components/CowrieRoll';

describe('CowrieRoll value display', () => {
  it('shows the live roll value', () => {
    render(<CowrieRoll value={3} live={true} canRoll={false} onRoll={() => {}} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText(/last roll/i)).toBeNull();
  });

  it('shows the last roll value (with a hint) after a no-move skip cleared currentRoll', () => {
    render(<CowrieRoll value={5} live={false} canRoll={true} onRoll={() => {}} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/last roll/i)).toBeInTheDocument();
  });

  it('names Chowka (6) and Bhara (12)', () => {
    const { rerender } = render(<CowrieRoll value={6} live onRoll={() => {}} canRoll={false} />);
    expect(screen.getByText('Chowka')).toBeInTheDocument();
    rerender(<CowrieRoll value={12} live canRoll={false} onRoll={() => {}} />);
    expect(screen.getByText('Bhara')).toBeInTheDocument();
  });

  it('shows a dash and disables rolling when there is no value', () => {
    const onRoll = vi.fn();
    render(<CowrieRoll value={null} live={false} canRoll={false} onRoll={onRoll} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /roll cowries/i })).toBeDisabled();
  });
});
