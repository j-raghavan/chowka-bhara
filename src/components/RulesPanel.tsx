import { RULESET_ID } from '../domain/config';

/** In-game rules summary (CB8-FR2/FR3). Mirrors the spec's canonical rules text. */
export function RulesPanel() {
  return (
    <div className="panel rules">
      <h2>Rules ({RULESET_ID})</h2>
      <dl>
        <dt>Cowries</dt>
        <dd>
          Six cowries. Open count is your move; all closed = 12 (Bhara), all open = 6 (Chowka).
        </dd>
        <dt>Entry</dt>
        <dd>
          Your first pawn comes out only on a roll of 1. Once a pawn is on the board, any pawn can
          come out on any roll (moving that many houses from home).
        </dd>
        <dt>Bonus</dt>
        <dd>Rolling 6 or 12, or hitting an opponent, grants another turn.</dd>
        <dt>Safe houses (×)</dt>
        <dd>
          The 8 ×-marked squares — the 4 board corners and the 4 inner-ring corners. Pawns there
          can't be hit, and any number of pawns may share a safe house.
        </dd>
        <dt>Hits</dt>
        <dd>
          On a non-safe house only one pawn may stand; landing on an opponent there sends it home
          and you take the house.
        </dd>
        <dt>Inner path</dt>
        <dd>You must hit at least one opponent before entering the inner rings.</dd>
        <dt>Finish</dt>
        <dd>Land exactly on the center crown to finish. First to bring all pawns home wins.</dd>
      </dl>
    </div>
  );
}
