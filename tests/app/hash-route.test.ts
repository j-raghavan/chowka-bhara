import { describe, expect, it } from 'vitest';
import { parseHash, roomHash } from '../../src/app/hash-route';

describe('hash routing', () => {
  it('parses the home route', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
    expect(parseHash('#/something-else')).toEqual({ name: 'home' });
  });

  it('parses a room route and decodes the id', () => {
    expect(parseHash('#/room/abc123')).toEqual({ name: 'room', gameId: 'abc123' });
    expect(parseHash('#/room/a%20b')).toEqual({ name: 'room', gameId: 'a b' });
  });

  it('builds a room hash that round-trips', () => {
    expect(parseHash(roomHash('game-9'))).toEqual({ name: 'room', gameId: 'game-9' });
  });
});
