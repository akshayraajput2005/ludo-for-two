import { useEffect, useRef, useState } from 'react';
import { LogOut, MessageCircle, Music, Volume2, VolumeX, X, RotateCcw, Home as HomeIcon } from 'lucide-react';
import Board from '../components/Board';
import Dice from '../components/Dice';
import Chat, { Reactions } from '../components/Chat';
import { Avatar, ConnBadge, Modal } from '../components/ui';
import { COLOR_HEX, type Color, type GameEvent, type RoomState } from '../game/types';
import { stepPath } from '../game/geometry';
import { emit } from '../services/socket';
import { isMuted, isMusicOn, setMusic, setMuted, sfx, unlockAudio } from '../services/sound';
import type { Conn, Reaction } from '../hooks/useRoom';

interface Props {
  room: RoomState;
  myId: string;
  conn: Conn;
  reactions: Reaction[];
  onLeave: () => void;
  onError: (m: string) => void;
  auto: boolean;
  onAuto: (on: boolean) => Promise<{ ok: boolean; error?: string }>;
}

const STEP_MS = 170;
const ROLL_MS = 600;

// Only this name sees the Manual / Bot switch (the server checks it too).
const canUseBot = (name: string) => name.toLowerCase().replace(/\s+/g, '') === 'kuttaakshay';

export default function Game({ room, myId, conn, reactions, onLeave, onError, auto, onAuto }: Props) {
  const game = room.game!;
  const me = room.players.find((p) => p.id === myId)!;
  const byColor = new Map(room.players.map((p) => [p.color, p]));
  const currentColor = game.order[game.current];
  const currentPlayer = byColor.get(currentColor);
  const myTurn = currentColor === me.color && game.phase !== 'over';

  // ---- visual layer: tokens animate step by step behind the authoritative state ----
  const [display, setDisplay] = useState(game.tokens);
  const [animating, setAnimating] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const latest = useRef(game.tokens);
  latest.current = game.tokens;
  const seenEvent = useRef(Math.max(0, ...game.events.map((e) => e.id)));
  const animTimer = useRef<number | undefined>(undefined);
  const animatingRef = useRef(false);

  useEffect(() => {
    const fresh = game.events.filter((e) => e.id > seenEvent.current);
    seenEvent.current = Math.max(seenEvent.current, ...game.events.map((e) => e.id));
    const name = (c: Color) => (c === me.color ? 'You' : byColor.get(c)?.name ?? c);
    const has = (t: GameEvent['type']) => fresh.some((e) => e.type === t);

    if (has('roll')) {
      sfx.dice();
      setRolling(true);
      setTimeout(() => {
        setRolling(false);
        const nm = fresh.find((e) => e.type === 'no-move');
        if (nm) setToast(`${name(nm.color)} rolled ${nm.dice} — no move`);
        if (has('three-sixes')) setToast(`Three sixes in a row! ${name(fresh[0].color)} lose${fresh[0].color === me.color ? '' : 's'} the turn`);
      }, ROLL_MS);
    }
    if (has('forfeit')) setToast(`${name(fresh.find((e) => e.type === 'forfeit')!.color)} left the game`);

    const mv = fresh.find((e) => e.type === 'move');
    if (mv && mv.from !== undefined && mv.to !== undefined) {
      const path = stepPath(mv.from, mv.to);
      let i = 0;
      clearInterval(animTimer.current);
      setAnimating(true);
      animatingRef.current = true;
      const step = () => {
        if (i >= path.length) return;
        const p = path[i++];
        setDisplay((d) => ({ ...d, [mv.color]: d[mv.color].map((v, k) => (k === mv.token ? p : v)) }));
        sfx.step();
        if (i >= path.length) {
          clearInterval(animTimer.current);
          setTimeout(() => {
            setDisplay(latest.current);
            setAnimating(false);
            animatingRef.current = false;
            if (has('capture')) sfx.capture();
            if (has('finish')) sfx.home();
            if (has('win')) sfx.win();
          }, STEP_MS);
        }
      };
      animTimer.current = window.setInterval(step, STEP_MS);
      step();
    } else if (!animatingRef.current) {
      setDisplay(game.tokens);
      if (has('win')) sfx.win();
    }
  }, [game.version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearInterval(animTimer.current), []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); } }, [toast]);

  // ---- actions ----
  const pending = useRef(false);
  const act = async (ev: string, args: object = {}) => {
    unlockAudio();
    if (pending.current) return; // one in flight at a time
    pending.current = true;
    const r = await emit(ev, args);
    pending.current = false;
    if (!r.ok) onError(r.error!);
  };
  const canRoll = myTurn && !auto && game.phase === 'roll' && !rolling && !animating && conn === 'connected';
  const legal = myTurn && !auto && game.phase === 'move' && !rolling && !animating ? game.legal : [];

  // Space / Enter rolls on laptops.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'r') && canRoll && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); void act('game:roll'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- UI state ----
  const [chatOpen, setChatOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [music, setMusicState] = useState(isMusicOn());
  const [unread, setUnread] = useState(0);
  const chatLen = useRef(room.chat.length);
  useEffect(() => {
    if (room.chat.length > chatLen.current && !chatOpen && room.chat.at(-1)?.playerId !== myId) setUnread((n) => n + 1);
    chatLen.current = room.chat.length;
  }, [room.chat.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const over = room.status === 'finished' && !animating;
  const winner = game.winner ? byColor.get(game.winner) : null;
  const opponentsGone = room.players.filter((p) => p.id !== myId && !p.left).length === 0;

  let status: string;
  if (game.phase === 'over') status = winner?.id === myId ? 'You won! 🎉' : `${winner?.name} won`;
  else if (rolling) status = myTurn ? 'Rolling…' : `${currentPlayer?.name} is rolling…`;
  else if (currentPlayer && !currentPlayer.connected) status = `${currentPlayer.name} is offline — waiting for them to reconnect`;
  else if (myTurn && auto) status = '🤖 Bot is playing for you…';
  else if (myTurn) status = game.phase === 'roll' ? (game.sixStreak > 0 ? 'Six! Roll again 🎲' : 'Your turn — roll the dice') : 'Tap a glowing token to move';
  else status = `${currentPlayer?.name}'s turn`;

  const controls = (
    <div className="card p-3 flex items-center gap-3">
      <Dice value={game.dice} rolling={rolling} canRoll={canRoll} color={COLOR_HEX[currentColor]} onRoll={() => act('game:roll')} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-extrabold uppercase tracking-wider" style={{ color: COLOR_HEX[currentColor] }}>
          {myTurn ? 'Your move' : `${currentPlayer?.avatar ?? ''} ${currentPlayer?.name ?? ''}`}
        </p>
        <p className="font-bold leading-snug text-[15px]" aria-live="polite">{status}</p>
      </div>
      <button className="btn btn-ghost !px-3 relative lg:hidden" onClick={() => { setChatOpen(true); setUnread(0); }} aria-label="Open chat">
        <MessageCircle className="size-5" />
        {unread > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[var(--color-rose)] text-white text-[11px] font-extrabold grid place-items-center">{unread}</span>}
      </button>
    </div>
  );

  return (
    <main className="game-grid h-dvh safe-pad gap-3 overflow-hidden">
      {/* head: top bar + players */}
      <div className="[grid-area:head] space-y-2 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-display font-bold tracking-widest text-sm btn-ghost rounded-full px-3 py-1">{room.code}</span>
          <ConnBadge conn={conn} compact />
          <div className="flex-1" />
          <button className="btn btn-ghost !min-h-9 !px-2.5" aria-label={music ? 'Music off' : 'Music on'} aria-pressed={music}
            onClick={() => { setMusic(!music); setMusicState(!music); }}>
            <Music className={`size-4 ${music ? '' : 'opacity-40'}`} />
          </button>
          <button className="btn btn-ghost !min-h-9 !px-2.5" aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={() => { unlockAudio(); setMuted(!muted); setMutedState(!muted); }}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <button className="btn btn-ghost !min-h-9 !px-2.5" aria-label="Leave game" onClick={() => setConfirmLeave(true)}><LogOut className="size-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 [&:has(>:nth-child(3))]:grid-cols-4 lg:!grid-cols-2 land:!grid-cols-2">
          {game.order.map((c) => {
            const p = byColor.get(c)!;
            const active = c === currentColor && game.phase !== 'over';
            const home = game.tokens[c].filter((t) => t === 56).length;
            return (
              <div key={c} className={`card flex items-center gap-2 p-2 transition ${active ? 'scale-[1.02]' : 'opacity-80'}`}
                style={{ borderColor: active ? COLOR_HEX[c] : undefined, borderWidth: active ? 2 : 1 }}>
                <Avatar p={p} size="sm" active={active} />
                <div className="min-w-0">
                  <p className="font-extrabold text-sm truncate">{p.name}</p>
                  <p className="text-[11px] muted font-bold">{p.id === myId ? 'You · ' : ''}{p.left ? 'left' : !p.connected ? 'offline' : `${home}/4 home`}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* board */}
      <div className="[grid-area:board] board-area relative min-h-0 min-w-0">
        <div className="board-wrap rounded-[1.4rem] shadow-[0_20px_50px_-25px_rgb(60_20_50/.55)]">
          <Board tokens={display} activeColors={game.order} current={game.phase === 'over' ? null : currentColor}
            legal={legal} myColor={me.color} onPick={(t) => act('game:move', { token: t, version: game.version })} />
        </div>
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
          {reactions.map((r, i) => (
            <span key={r.id} className="float-emoji" style={{ left: `${30 + ((r.id * 37 + i * 11) % 40)}%` }}>
              {r.emoji}<span className="text-base align-top">{room.players.find((p) => p.id === r.playerId)?.avatar}</span>
            </span>
          ))}
        </div>
      </div>

      {/* foot: dice + status + reactions */}
      <div className="[grid-area:foot] space-y-2 min-w-0">
        {controls}
        {canUseBot(me.name) && game.phase !== 'over' && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-full btn-ghost" role="radiogroup" aria-label="Who plays your turns">
            {([false, true] as const).map((on) => (
              <button key={String(on)} role="radio" aria-checked={auto === on}
                onClick={async () => { const r = await onAuto(on); if (!r.ok) onError(r.error!); }}
                className={`rounded-full py-1.5 text-sm font-extrabold transition ${auto === on ? 'bg-[var(--card)] shadow' : 'muted'}`}>
                {on ? '🤖 Bot' : '✋ Manual'}
              </button>
            ))}
          </div>
        )}
        <div className="hidden lg:block land:!hidden"><Reactions onError={onError} /></div>
      </div>

      {/* chat panel on wide screens */}
      <aside className="[grid-area:chat] card p-3 min-h-0 hidden lg:flex land:!hidden flex-col">
        <Chat room={room} myId={myId} onError={onError} />
      </aside>

      {/* chat sheet on phones (portrait) */}
      {chatOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setChatOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 card !rounded-b-none p-4 pb-[max(env(safe-area-inset-bottom),1rem)] h-[70dvh] flex flex-col gap-2 pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-lg">Chat</h2>
              <button className="btn btn-ghost !min-h-9 !px-2.5" onClick={() => setChatOpen(false)} aria-label="Close chat"><X className="size-4" /></button>
            </div>
            <Reactions onError={onError} />
            <div className="flex-1 min-h-0"><Chat room={room} myId={myId} onError={onError} /></div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 top-[max(env(safe-area-inset-top),4.5rem)] z-30 card px-4 py-2 text-sm font-bold pop-in pointer-events-none">{toast}</div>
      )}

      {conn !== 'connected' && !over && (
        <div className="fixed inset-x-0 top-0 z-[45] bg-amber-500 text-white text-center text-sm font-bold py-1.5 pt-[max(env(safe-area-inset-top),.375rem)]">
          {conn === 'disconnected' ? 'Disconnected' : 'Connection lost — reconnecting…'} Your game is saved on the server.
        </div>
      )}

      {confirmLeave && (
        <Modal onClose={() => setConfirmLeave(false)}>
          <h2 className="font-display text-2xl font-semibold mb-2">Leave the game?</h2>
          <p className="muted mb-5">{room.status === 'playing' ? 'Leaving now forfeits the match.' : 'You can start a new room later.'}</p>
          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={() => setConfirmLeave(false)}>Stay</button>
            <button className="btn btn-primary flex-1" onClick={onLeave}>Leave</button>
          </div>
        </Modal>
      )}

      {over && winner && (
        <>
          <Confetti />
          <Modal>
            <div className="text-6xl mb-2">{winner.id === myId ? '🏆' : '💐'}</div>
            <h2 className="font-display text-3xl font-bold mb-1">{winner.id === myId ? 'You won!' : `${winner.name} won!`}</h2>
            <p className="muted mb-1">{winner.avatar} {game.tokens[winner.color].every((t) => t === 56) ? 'brought all four tokens home.' : 'won because the others left.'}</p>
            {room.rematch.length > 0 && !opponentsGone && (
              <p className="text-sm font-bold mb-1">{room.rematch.includes(myId) ? 'Waiting for the rematch vote…' : 'Rematch requested! 🔁'}</p>
            )}
            {opponentsGone && <p className="text-sm font-bold mb-1">Everyone else left the room.</p>}
            <div className="flex gap-2 mt-4">
              <button className="btn btn-ghost flex-1" onClick={onLeave}><HomeIcon className="size-4" />Home</button>
              <button className="btn btn-primary flex-1" disabled={opponentsGone || room.rematch.includes(myId)} onClick={() => act('game:rematch')}>
                <RotateCcw className="size-4" />Rematch
              </button>
            </div>
            {!opponentsGone && (
              <button className="btn btn-ghost w-full mt-2" onClick={() => act('tot:draw', { category: 'romantic' })}>💞 Play This or That</button>
            )}
          </Modal>
        </>
      )}
    </main>
  );
}

function Confetti() {
  const [pieces] = useState(() => Array.from({ length: 60 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 1.5, dur: 2.5 + Math.random() * 2,
    color: Object.values(COLOR_HEX)[i % 4],
  })));
  return <>{pieces.map((p, i) => <span key={i} className="confetti" style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }} />)}</>;
}
