import { useGame } from './app/useGame';
import { HomePage } from './pages/HomePage';
import { GamePage } from './pages/GamePage';

export function App() {
  const { state, startLocal, roll, selectMove, resign, reset } = useGame();

  if (state === null) {
    return (
      <div className="app-shell">
        <HomePage onStart={startLocal} />
      </div>
    );
  }

  return (
    <GamePage
      state={state}
      onRoll={roll}
      onSelectMove={selectMove}
      onResign={resign}
      onNewGame={reset}
    />
  );
}
