import { describe, expect, it } from 'vitest';
import {
  cryptoRandomSource,
  makeProductionEnv,
  systemClock,
  uuidIdSource,
} from '../../src/app/env';

describe('production env (app layer)', () => {
  it('systemClock returns a number', () => {
    expect(typeof systemClock.now()).toBe('number');
  });

  it('uuidIdSource returns distinct string ids', () => {
    const a = uuidIdSource.next();
    const b = uuidIdSource.next();
    expect(typeof a).toBe('string');
    expect(a).not.toBe(b);
  });

  it('cryptoRandomSource returns the requested count of open/closed faces', () => {
    const faces = cryptoRandomSource.rollFaces(6);
    expect(faces).toHaveLength(6);
    expect(faces.every((f) => f === 'open' || f === 'closed')).toBe(true);
  });

  it('makeProductionEnv bundles the three ports', () => {
    const env = makeProductionEnv();
    expect(env.clock.now()).toBeTypeOf('number');
    expect(env.ids.next()).toBeTypeOf('string');
    expect(env.random.rollFaces(6)).toHaveLength(6);
  });
});
