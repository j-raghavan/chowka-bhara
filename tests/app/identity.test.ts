import { describe, expect, it } from 'vitest';
import {
  clearIdentity,
  loadIdentity,
  saveIdentity,
  type RoomIdentity,
} from '../../src/app/identity';

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

const id: RoomIdentity = {
  gameId: 'g1',
  playerId: 'p1',
  reclaimToken: 't1',
  displayName: 'Alice',
  spectator: false,
};

describe('per-tab room identity', () => {
  it('saves and loads identity by gameId', () => {
    const s = memStorage();
    expect(loadIdentity('g1', s)).toBeNull();
    saveIdentity(id, s);
    expect(loadIdentity('g1', s)).toEqual(id);
  });

  it('clears identity', () => {
    const s = memStorage();
    saveIdentity(id, s);
    clearIdentity('g1', s);
    expect(loadIdentity('g1', s)).toBeNull();
  });

  it('returns null when storage is unavailable', () => {
    expect(loadIdentity('g1', null)).toBeNull();
    expect(() => saveIdentity(id, null)).not.toThrow();
    expect(() => clearIdentity('g1', null)).not.toThrow();
  });
});
