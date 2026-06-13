import { facesForValue } from '../domain/cowries';
import type { RollValue } from '../domain/types';

const ROLL_NAME: Record<number, string> = { 6: 'Chowka', 12: 'Bhara' };
const ALL_CLOSED = ['closed', 'closed', 'closed', 'closed', 'closed', 'closed'] as const;

export interface CowrieRollProps {
  /** The value to display: the live roll, or the last roll from history. */
  readonly value: number | null;
  /** True while the displayed roll still awaits a move (not yet skipped/applied). */
  readonly live: boolean;
  readonly canRoll: boolean;
  readonly onRoll: () => void;
}

export function CowrieRoll({ value, live, canRoll, onRoll }: CowrieRollProps) {
  const faces = value === null ? ALL_CLOSED : facesForValue(value as RollValue);
  return (
    <div>
      <div className="cowrie-row" aria-hidden="true">
        {faces.map((face, i) => (
          <span key={i} className={`cowrie ${face}`} />
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
