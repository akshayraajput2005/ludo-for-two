import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRoom } from './hooks/useRoom';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import ThisOrThat from './pages/ThisOrThat';
import { Modal, Toast } from './components/ui';


export default function App() {
  const r = useRoom();
  // Read every render: leaving a room clears ?room= from the URL.
  const inviteCode = new URLSearchParams(location.search).get('room')?.toUpperCase().slice(0, 12) ?? null;
  const [error, setError] = useState<string | null>(null);
  const toast = error && <Toast text={error} onDone={() => setError(null)} />;
  useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 3000); return () => clearTimeout(t); } }, [error]);

  // Seat taken over by another tab/device: socket.io won't auto-reconnect here.
  if (r.conn === 'disconnected' && r.me) {
    return (
      <Modal>
        <h2 className="font-display text-2xl font-semibold mb-2">Opened somewhere else</h2>
        <p className="muted mb-5">This game is open in another tab or device. Use it here instead?</p>
        <button className="btn btn-primary w-full" onClick={r.reconnect}>Play here</button>
      </Modal>
    );
  }

  if (r.rejoining || (r.me && !r.room)) {
    return (
      <main className="min-h-dvh grid place-items-center safe-pad text-center">
        <div className="space-y-3">
          <Loader2 className="size-10 animate-spin mx-auto text-[var(--color-rose)]" />
          <p className="font-bold">{r.conn === 'connected' ? 'Rejoining your game…' : 'Connecting to the server…'}</p>
          <p className="muted text-sm max-w-xs">Free servers can take up to a minute to wake up the first time.</p>
          <button className="btn btn-ghost text-sm" onClick={r.forget}>Cancel</button>
        </div>
      </main>
    );
  }

  if (!r.room || !r.me) {
    return <Home conn={r.conn} notice={r.notice} inviteCode={inviteCode} onCreate={r.create} onJoin={r.join} />;
  }

  const common = { room: r.room, myId: r.me.playerId, conn: r.conn, onLeave: r.leave, onError: setError };
  return (
    <>
      {r.room.kind === 'ludo' && r.room.status !== 'lobby'
        ? <Game {...common} reactions={r.reactions} auto={r.auto} onAuto={r.setAuto} />
        : r.room.tot ? <ThisOrThat {...common} reactions={r.reactions} /> : <Lobby {...common} />}
      {toast}
    </>
  );
}
