/**
 * Input validation at the system boundary (CLAUDE.md: "Validate input at
 * system boundaries"). These helpers are pure and import nothing, so both the
 * client and the server-authority Edge Function can apply the SAME rules — a
 * modified client or a direct API write cannot smuggle in oversized or
 * control-character display names, and game ids are constrained to a safe
 * charset (which also closes the PostgREST realtime-filter interpolation in
 * SupabaseTransport).
 */

/** Hard cap on a stored display name (matches the UI input maxLength). */
export const DISPLAY_NAME_MAX_LENGTH = 20;

/** Fallback used when a name is empty/blank after sanitisation. */
export const DEFAULT_DISPLAY_NAME = 'Player';

// Non-whitespace control chars: C0 (except the whitespace ones \t\n\v\f\r),
// DEL, and C1. Built from explicit escapes (no literal control bytes in
// source). These are DELETED. Whitespace controls (tabs/newlines) and Unicode
// separators are left for the `\s+` collapse below so "first\nlast" becomes
// "first last" rather than "firstlast". Stripping (not rejecting) keeps honest
// UIs forgiving while guaranteeing stored data is clean.
// eslint-disable-next-line no-control-regex -- intentionally matches control chars to strip them
const NON_WS_CONTROL = new RegExp('[\\u0000-\\u0008\\u000E-\\u001F\\u007F-\\u009F]', 'g');

/**
 * Produce a safe, bounded display name from arbitrary input:
 * delete non-whitespace control chars, collapse all whitespace to single
 * spaces, trim, clamp to DISPLAY_NAME_MAX_LENGTH, and fall back to
 * DEFAULT_DISPLAY_NAME when nothing usable remains.
 */
export function sanitizeDisplayName(raw: string): string {
  const cleaned = raw
    .replace(NON_WS_CONTROL, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DISPLAY_NAME_MAX_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : DEFAULT_DISPLAY_NAME;
}

/**
 * A display name is valid iff sanitising it leaves it unchanged — used by the
 * authority to assert stored names are already clean.
 */
export function isValidDisplayName(name: string): boolean {
  return sanitizeDisplayName(name) === name;
}

// Room ids: our own ids are UUIDv4, but createRoom also accepts a caller id, so
// allow a conservative URL-safe charset. This is what guards the realtime
// `filter: game_id=eq.${gameId}` string against injection.
const GAME_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidGameId(id: string): boolean {
  return GAME_ID_PATTERN.test(id);
}

/** Throwing guard for transport boundaries that must not proceed on bad input. */
export function assertValidGameId(id: string): void {
  if (!isValidGameId(id)) {
    throw new Error(`invalid gameId: ${JSON.stringify(id)}`);
  }
}
