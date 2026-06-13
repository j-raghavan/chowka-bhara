import { useEffect, useRef, useState } from 'react';
import { scoreCowries } from '../domain/cowries';
import type { CowrieFace } from '../domain/types';

const ROLL_NAME: Record<number, string> = { 6: 'Chowka', 12: 'Bhara' };
const ALL_CLOSED: readonly CowrieFace[] = [
  'closed',
  'closed',
  'closed',
  'closed',
  'closed',
  'closed',
];
const SHAKE_MS = 600;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

export interface CowrieRollProps {
  /** The actual thrown faces (live roll, or the last roll from history). */
  readonly faces: readonly CowrieFace[] | null;
  /** True while the displayed roll still awaits a move (not yet skipped/applied). */
  readonly live: boolean;
  readonly canRoll: boolean;
  readonly onRoll: () => void;
}

export function CowrieRoll({ faces, live, canRoll, onRoll }: CowrieRollProps) {
  const [shaking, setShaking] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = faces && faces.length === 6 ? scoreCowries(faces) : null;
  const shells = shaking || !(faces && faces.length === 6) ? ALL_CLOSED : faces;
  // Re-key the row so the CSS reveal/shake animation replays on every new throw.
  const animKey = shaking ? 'shaking' : faces ? faces.join('') : 'none';

  const handleRoll = (): void => {
    onRoll();
    if (prefersReducedMotion()) return;
    window.clearTimeout(timer.current);
    setShaking(true);
    timer.current = window.setTimeout(() => setShaking(false), SHAKE_MS);
  };

  return (
    <div>
      <div
        key={animKey}
        className={'cowrie-row' + (shaking ? ' shaking' : '')}
        aria-label={value === null ? 'no roll yet' : `rolled ${value}`}
      >
        {shells.map((face, i) => (
          <span
            key={i}
            className={`cowrie ${face}`}
            style={{ animationDelay: `${i * 45}ms` }}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="roll-value" aria-live="polite">
        {shaking ? '…' : (value ?? '—')}
        {!shaking && value !== null && !live ? (
          <span className="roll-last"> (last roll)</span>
        ) : null}
      </div>
      <div className="roll-name">{!shaking && value !== null ? (ROLL_NAME[value] ?? '') : ''}</div>
      <button
        className="btn"
        onClick={handleRoll}
        disabled={!canRoll}
        style={{ width: '100%', marginTop: '0.5rem' }}
      >
        Roll cowries
      </button>
    </div>
  );
}
