import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/App';

describe('App online flow (smoke)', () => {
  beforeEach(() => {
    window.location.hash = '';
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('renders the home screen with the board replica and a create-room form', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /chowka bhara/i })).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: /chowka bhara board/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create a room/i })).toBeInTheDocument();
  });

  it('creates a room and lands in the lobby as host', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('textbox', { name: /your name/i }), 'Alice');
    await user.click(screen.getByRole('button', { name: /create a room/i }));

    // Navigated to a room URL.
    await waitFor(() => expect(window.location.hash).toMatch(/#\/room\//));
    // jsdom doesn't always emit hashchange on programmatic assignment; nudge it.
    window.dispatchEvent(new Event('hashchange'));

    expect(await screen.findByRole('heading', { name: /game lobby/i })).toBeInTheDocument();
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
    // Host sees a start control (disabled until 2+ players).
    expect(
      screen.getByRole('button', { name: /need 2\+ players|start game/i }),
    ).toBeInTheDocument();
  });
});
