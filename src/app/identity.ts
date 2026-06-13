/**
 * Per-tab room identity. Stored in sessionStorage (NOT localStorage) so two
 * tabs in the same browser are two DISTINCT players, while a refresh of a tab
 * keeps that tab's seat. The reclaim token lets the tab rejoin its seat after
 * a refresh (CB5-FR9). Room *state* lives in the transport (shared); identity
 * is who this tab is.
 */
export interface RoomIdentity {
  readonly gameId: string;
  readonly playerId: string;
  readonly reclaimToken: string;
  readonly displayName: string;
  readonly spectator: boolean;
}

const key = (gameId: string): string => `cb:me:${gameId}`;

function storageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    /* v8 ignore next -- sessionStorage may be unavailable in some sandboxes */
    return null;
  }
}

export function loadIdentity(gameId: string, storage: Storage | null = storageOrNull()): RoomIdentity | null {
  const raw = storage?.getItem(key(gameId));
  return raw ? (JSON.parse(raw) as RoomIdentity) : null;
}

export function saveIdentity(identity: RoomIdentity, storage: Storage | null = storageOrNull()): void {
  storage?.setItem(key(identity.gameId), JSON.stringify(identity));
}

export function clearIdentity(gameId: string, storage: Storage | null = storageOrNull()): void {
  storage?.removeItem(key(gameId));
}
