import { useRoom } from './app/useRoom';
import { HomePage } from './pages/HomePage';
import { JoinPrompt } from './pages/JoinPrompt';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';

export function App() {
  const room = useRoom();

  if (room.route.name === 'home') {
    return (
      <div className="app-shell">
        <HomePage onCreate={room.createRoom} />
      </div>
    );
  }

  // Room route.
  if (!room.ready || room.state === null) {
    return (
      <div className="app-shell">
        <p className="loading">Loading room…</p>
      </div>
    );
  }

  if (room.needsJoin) {
    return (
      <div className="app-shell">
        <JoinPrompt state={room.state} onJoin={room.joinAs} />
      </div>
    );
  }

  if (room.state.status === 'lobby') {
    return (
      <div className="app-shell">
        <LobbyPage room={room} />
      </div>
    );
  }

  return <GamePage room={room} />;
}
