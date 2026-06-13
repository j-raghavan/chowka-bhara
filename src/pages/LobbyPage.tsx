import { useState } from 'react';
import { PAWN_PALETTE } from '../domain/config';
import { SIDE_LABEL } from '../ui/board-theme';
import type { RoomView } from '../app/useRoom';

export function LobbyPage({ room }: { room: RoomView }) {
  const { state, me, isHost } = room;
  const [copied, setCopied] = useState(false);
  if (state === null) return null;

  const seats = state.playerOrder.map((id) => state.players[id]).filter((p) => p !== undefined);
  const canStart =
    isHost && seats.length >= state.config.minPlayers && seats.length <= state.config.maxPlayers;
  const takenColors = new Set(seats.map((p) => p!.color));
  const myColor = me ? state.players[me.playerId]?.color : undefined;

  const share = (): void => {
    void navigator.clipboard?.writeText(window.location.href).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => setCopied(false),
    );
  };

  return (
    <div className="home">
      <h1>Game lobby</h1>
      <p className="tagline">
        {seats.length} of {state.config.maxPlayers} seated · waiting for the host to start.
      </p>

      <div className="panel lobby-panel">
        <h2>Seats</h2>
        {seats.map((p, i) => (
          <div key={p!.id} className={'player-row' + (p!.id === me?.playerId ? ' current' : '')}>
            <span className="dot" style={{ background: p!.color }} />
            <span className="player-info">
              <strong>
                {p!.displayName} {p!.id === me?.playerId ? '(you)' : ''}
              </strong>
              <small>{i === 0 ? 'Host' : SIDE_LABEL[p!.side]}</small>
            </span>
          </div>
        ))}
      </div>

      {me && !me.spectator && (
        <div className="panel lobby-panel">
          <h2>Your pawn color</h2>
          <div className="swatches">
            {PAWN_PALETTE.map((color) => {
              const takenByOther = takenColors.has(color) && color !== myColor;
              const selected = color === myColor;
              return (
                <button
                  key={color}
                  type="button"
                  className={'swatch' + (selected ? ' selected' : '')}
                  style={{ background: color }}
                  disabled={takenByOther}
                  aria-label={`Choose color ${color}${takenByOther ? ' (taken)' : ''}`}
                  aria-pressed={selected}
                  title={takenByOther ? 'Taken by another player' : 'Choose this color'}
                  onClick={() => room.setColor(color)}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="home-actions">
        <button className="btn secondary" onClick={share}>
          {copied ? 'Link copied!' : 'Copy invite link'}
        </button>
        {isHost ? (
          <button className="btn" onClick={room.start} disabled={!canStart}>
            {canStart ? 'Start game' : `Need ${state.config.minPlayers}+ players`}
          </button>
        ) : (
          <span className="tagline">Waiting for the host…</span>
        )}
        <button className="btn secondary" onClick={room.goHome}>
          Leave
        </button>
      </div>

      {me?.spectator && <p className="tagline">This room is full — you're spectating.</p>}
    </div>
  );
}
