/**
 * Production DomainEnv. Constructed in the APP layer and injected downward so
 * the domain only ever sees the Clock/IdSource/CowrieRandomSource interfaces
 * (boundary rule B3). Date.now()/crypto are permitted here, never in src/domain.
 */
import type { Clock, CowrieFace, CowrieRandomSource, DomainEnv, IdSource } from '../domain/types';

export const systemClock: Clock = { now: () => Date.now() };

export const uuidIdSource: IdSource = {
  next: () => crypto.randomUUID(),
};

export const cryptoRandomSource: CowrieRandomSource = {
  rollFaces(count: number): readonly CowrieFace[] {
    const bytes = new Uint8Array(count);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => ((b & 1) === 0 ? 'open' : 'closed'));
  },
};

export function makeProductionEnv(): DomainEnv {
  return { clock: systemClock, ids: uuidIdSource, random: cryptoRandomSource };
}
