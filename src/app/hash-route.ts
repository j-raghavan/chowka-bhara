/**
 * Hash-based routing — works on GitHub Pages with no SPA fallback or server
 * config. Room deep links are `#/room/:gameId`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isValidGameId } from '../domain/validation';

export type Route = { readonly name: 'home' } | { readonly name: 'room'; readonly gameId: string };

export function parseHash(hash: string): Route {
  const match = hash.match(/^#\/room\/([^/?#]+)/);
  if (match === null) return { name: 'home' };
  let gameId: string;
  try {
    gameId = decodeURIComponent(match[1]!);
  } catch {
    return { name: 'home' }; // malformed percent-encoding
  }
  // Reject ids outside the safe charset rather than routing into a room whose
  // id could poison the realtime filter or address an arbitrary row.
  return isValidGameId(gameId) ? { name: 'room', gameId } : { name: 'home' };
}

export function roomHash(gameId: string): string {
  return `#/room/${encodeURIComponent(gameId)}`;
}

export function useHashRoute(): [Route, (hash: string) => void] {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = (): void => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = useCallback((next: string) => {
    window.location.hash = next;
  }, []);
  const route = useMemo(() => parseHash(hash), [hash]);
  return [route, navigate];
}
