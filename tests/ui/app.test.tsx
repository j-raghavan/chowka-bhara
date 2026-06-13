import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/App';

describe('App (smoke)', () => {
  it('renders the home screen with the board replica', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /chowka bhara/i })).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: /chowka bhara board/i })).toBeInTheDocument();
  });

  it('starts a local 2-player game and lets the current player roll', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /play 2 players/i }));

    // Game page appears with a roll control and a turn banner.
    const rollButton = await screen.findByRole('button', { name: /roll cowries/i });
    expect(rollButton).toBeInTheDocument();
    expect(screen.getByText(/roll the cowries|choose a highlighted move/i)).toBeInTheDocument();

    await user.click(rollButton);
    // After rolling, a roll value is shown (any of 1..6 or 12) or the turn resolved.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new game/i })).toBeInTheDocument();
    });
  });

  it('toggles the in-game rules panel', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /play 2 players/i }));
    await screen.findByRole('button', { name: /roll cowries/i });
    await user.click(screen.getByRole('button', { name: /^rules$/i }));
    expect(await screen.findByText(/six cowries/i)).toBeInTheDocument();
  });
});
