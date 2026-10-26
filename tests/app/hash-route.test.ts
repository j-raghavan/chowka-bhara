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
    // %2D decodes to '-', which is inside the safe charset.
    expect(parseHash('#/room/a%2Db')).toEqual({ name: 'room', gameId: 'a-b' });
  });

  it('rejects ids outside the safe charset (filter-injection / arbitrary row)', () => {
    expect(parseHash('#/room/a%20b')).toEqual({ name: 'home' }); // space
    expect(parseHash('#/room/' + encodeURIComponent('eq.1,or=(x)'))).toEqual({ name: 'home' });
    expect(parseHash('#/room/' + 'x'.repeat(65))).toEqual({ name: 'home' }); // too long
  });

  it('treats malformed percent-encoding as home', () => {
    expect(parseHash('#/room/%E0%A4%A')).toEqual({ name: 'home' });
  });

  it('builds a room hash that round-trips', () => {
    expect(parseHash(roomHash('game-9'))).toEqual({ name: 'room', gameId: 'game-9' });
  });
});
