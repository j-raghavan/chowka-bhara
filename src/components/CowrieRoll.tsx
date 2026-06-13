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

export interface CowrieRollProps {
  /** The actual thrown faces (live roll, or the last roll from history). */
  readonly faces: readonly CowrieFace[] | null;
  /** True while the displayed roll still awaits a move (not yet skipped/applied). */
  readonly live: boolean;
  readonly canRoll: boolean;
  readonly onRoll: () => void;
}

export function CowrieRoll({ faces, live, canRoll, onRoll }: CowrieRollProps) {
  const value = faces && faces.length === 6 ? scoreCowries(faces) : null;
  const shells = faces && faces.length === 6 ? faces : ALL_CLOSED;
  return (
    <div>
      <div className="cowrie-row" aria-label={value === null ? 'no roll yet' : `rolled ${value}`}>
        {shells.map((face, i) => (
          <span key={i} className={`cowrie ${face}`} aria-hidden="true" />
        ))}
      </div>
      <div className="roll-value" aria-live="polite">
        {value ?? '—'}
        {value !== null && !live ? <span className="roll-last"> (last roll)</span> : null}
      </div>
      <div className="roll-name">{value !== null ? (ROLL_NAME[value] ?? '') : ''}</div>
      <button
        className="btn"
        onClick={onRoll}
        disabled={!canRoll}
        style={{ width: '100%', marginTop: '0.5rem' }}
      >
        Roll cowries
      </button>
    </div>
  );
}
