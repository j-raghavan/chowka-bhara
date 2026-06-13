import { expect, test } from '@playwright/test';

/**
 * Full online flow in a real browser: two tabs of one browser (shared
 * localStorage + BroadcastChannel = the default BrowserTransport) create a room,
 * join, start, and take a turn — proving UI ↔ transport ↔ reducer integration
 * that jsdom smoke tests can't.
 */
test('two tabs create, join, start, and play a turn online', async ({ context }) => {
  const host = await context.newPage();
  const guest = await context.newPage();

  // Host creates a room.
  await host.goto('/');
  await host.getByRole('textbox', { name: /your name/i }).fill('Alice');
  await host.getByRole('button', { name: /create a room/i }).click();
  await expect(host).toHaveURL(/#\/room\//);
  await expect(host.getByRole('heading', { name: /game lobby/i })).toBeVisible();

  // Guest opens the same room URL and takes a seat.
  const roomUrl = host.url();
  await guest.goto(roomUrl);
  await guest.getByRole('textbox', { name: /your name/i }).fill('Bob');
  await guest.getByRole('button', { name: /take a seat/i }).click();

  // Both tabs see two seated players (cross-tab sync).
  await expect(host.getByText('Alice')).toBeVisible();
  await expect(host.getByText('Bob')).toBeVisible();
  await expect(guest.getByText('Alice')).toBeVisible();

  // Host starts; both tabs leave the lobby and render the board.
  await host.getByRole('button', { name: /start game/i }).click();
  await expect(host.getByRole('grid', { name: /chowka bhara board/i })).toBeVisible();
  await expect(guest.getByRole('grid', { name: /chowka bhara board/i })).toBeVisible();

  // Host (South, first turn) rolls; a roll resolves and both tabs stay in sync.
  await host.getByRole('button', { name: /roll cowries/i }).click();
  // The history log on the host records the roll...
  await expect(host.getByText(/rolled \d+/i).first()).toBeVisible();
  // ...and the guest tab receives the update too (its history shows the roll).
  await expect(guest.getByText(/rolled \d+/i).first()).toBeVisible();
});
