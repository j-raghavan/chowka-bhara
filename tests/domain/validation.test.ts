import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISPLAY_NAME,
  DISPLAY_NAME_MAX_LENGTH,
  assertValidGameId,
  isValidDisplayName,
  isValidGameId,
  sanitizeDisplayName,
} from '../../src/domain/validation';

describe('sanitizeDisplayName', () => {
  it('keeps a clean name unchanged', () => {
    expect(sanitizeDisplayName('Alice')).toBe('Alice');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeDisplayName('  Bob  ')).toBe('Bob');
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(sanitizeDisplayName('a\t\t  b')).toBe('a b');
  });

  it('strips control characters (newline, tab, DEL, bell)', () => {
    expect(sanitizeDisplayName('a\nb')).toBe('a b');
    expect(sanitizeDisplayName('ab')).toBe('ab');
    expect(sanitizeDisplayName('ab')).toBe('ab');
  });

  it('strips Unicode line/paragraph separators', () => {
    expect(sanitizeDisplayName('a b')).toBe('a b');
    expect(sanitizeDisplayName('a b')).toBe('a b');
  });

  it('clamps to the max length', () => {
    const out = sanitizeDisplayName('x'.repeat(100));
    expect(out).toHaveLength(DISPLAY_NAME_MAX_LENGTH);
  });

  it('falls back to the default when empty or whitespace-only', () => {
    expect(sanitizeDisplayName('')).toBe(DEFAULT_DISPLAY_NAME);
    expect(sanitizeDisplayName('   ')).toBe(DEFAULT_DISPLAY_NAME);
    expect(sanitizeDisplayName('\n\t')).toBe(DEFAULT_DISPLAY_NAME);
  });

  it('is idempotent', () => {
    const once = sanitizeDisplayName('  Weird\t Name  ');
    expect(sanitizeDisplayName(once)).toBe(once);
  });
});

describe('isValidDisplayName', () => {
  it('accepts an already-clean name', () => {
    expect(isValidDisplayName('Alice')).toBe(true);
  });

  it('rejects names that sanitisation would change', () => {
    expect(isValidDisplayName('  padded  ')).toBe(false);
    expect(isValidDisplayName('x'.repeat(21))).toBe(false);
    expect(isValidDisplayName('bad ')).toBe(false);
  });
});

describe('isValidGameId / assertValidGameId', () => {
  it('accepts UUIDs and URL-safe ids', () => {
    expect(isValidGameId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidGameId('fixed-room')).toBe(true);
    expect(isValidGameId('Room_123')).toBe(true);
  });

  it('rejects empty, too-long, and unsafe ids', () => {
    expect(isValidGameId('')).toBe(false);
    expect(isValidGameId('x'.repeat(65))).toBe(false);
    expect(isValidGameId('a b')).toBe(false);
    expect(isValidGameId('eq.1,or=(x)')).toBe(false);
    expect(isValidGameId('a/b')).toBe(false);
  });

  it('assertValidGameId throws on bad input and is silent on good', () => {
    expect(() => assertValidGameId('good-id')).not.toThrow();
    expect(() => assertValidGameId('bad id')).toThrow(/invalid gameId/);
  });
});
