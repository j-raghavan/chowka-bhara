import type { CowrieRoll as Roll } from '../domain/types';

const ROLL_NAME: Record<number, string> = { 6: 'Chowka', 12: 'Bhara' };

export interface CowrieRollProps {
  readonly roll: Roll | null;
  readonly canRoll: boolean;
  readonly onRoll: () => void;
}

export function CowrieRoll({ roll, canRoll, onRoll }: CowrieRollProps) {
  const faces = roll?.faces ?? (['closed', 'closed', 'closed', 'closed', 'closed', 'closed'] as const);
  return (
    <div>
      <div className="cowrie-row" aria-hidden="true">
        {faces.map((face, i) => (
          <span key={i} className={`cowrie ${face}`} />
        ))}
      </div>
      <div className="roll-value" aria-live="polite">
        {roll ? roll.value : '—'}
      </div>
      <div className="roll-name">{roll ? (ROLL_NAME[roll.value] ?? '') : ''}</div>
      <button className="btn" onClick={onRoll} disabled={!canRoll} style={{ width: '100%', marginTop: '0.5rem' }}>
        Roll cowries
      </button>
    </div>
  );
}
