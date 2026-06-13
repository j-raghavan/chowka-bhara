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
        <dd>A pawn enters the board only on a roll of 1.</dd>
        <dt>Bonus</dt>
        <dd>Rolling 6 or 12, or hitting an opponent, grants another turn.</dd>
        <dt>No stacking</dt>
        <dd>Only one pawn per house. No Gatti, no doubles, no paired movement.</dd>
        <dt>Hits</dt>
        <dd>
          Landing on an opponent on a non-safe house sends it home. Safe houses (× and starts) block
          landing instead.
        </dd>
        <dt>Inner path</dt>
        <dd>You must hit at least one opponent before entering the inner rings.</dd>
        <dt>Finish</dt>
        <dd>Land exactly on the center crown to finish. First to bring all pawns home wins.</dd>
      </dl>
    </div>
  );
}
