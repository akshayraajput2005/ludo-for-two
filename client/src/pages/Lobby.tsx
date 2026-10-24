import { useState } from 'react';
import { Check, Copy, Share2, LogOut, Play } from 'lucide-react';
import type { RoomState } from '../game/types';
import { COLOR_HEX } from '../game/types';
import { emit } from '../services/socket';
import { unlockAudio } from '../services/sound';
import type { Conn } from '../hooks/useRoom';
import { Avatar, ConnBadge } from '../components/ui';
import { TOT_CATEGORIES, TOT_LABELS, type TotCategory } from '../../../shared/questions.ts';
import { AdultGate, adultOk } from './ThisOrThat';

// Native bridge injected by the Android app (WebView has no Web Share / clipboard API).
const android = (window as unknown as { LudoAndroid?: { share(t: string): void; copy(t: string): void } }).LudoAndroid;

interface Props {
  room: RoomState;
  myId: string;
  conn: Conn;
  onLeave: () => void;
  onError: (m: string) => void;
}

export default function Lobby({ room, myId, conn, onLeave, onError }: Props) {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const [gate, setGate] = useState(false);
  const link = `${location.origin}/?room=${room.code}`;
  const me = room.players.find((p) => p.id === myId);
  const isHost = room.hostId === myId;
  const isLudo = room.kind === 'ludo';
  const allReady = room.players.length >= 2 && room.players.every((p) => p.ready);

  const copy = async (what: 'link' | 'code') => {
    const text = what === 'link' ? link : room.code;
    try {
      if (android) android.copy(text);
      else await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch { onError('Copy failed — select the text and copy it manually'); }
  };
  const shareText = `Play Ludo with me! Room ${room.code}`;
  const share = () => android
    ? android.share(`${shareText} ${link}`)
    : navigator.share?.({ title: 'Ludo for Two', text: shareText, url: link }).catch(() => {});
  const act = async (ev: string, args = {}) => { unlockAudio(); const r = await emit(ev, args); if (!r.ok) onError(r.error!); };

  return (
    <main className="min-h-dvh safe-pad grid place-items-center">
      <div className="w-full max-w-md space-y-4 py-4">
        <div className="flex items-center justify-between">
          <ConnBadge conn={conn} />
          <button className="btn btn-ghost !min-h-9 text-sm" onClick={onLeave}><LogOut className="size-4" />Leave</button>
        </div>

        <section className="card p-5 text-center space-y-3">
          <p className="text-sm font-extrabold muted uppercase tracking-wider">{room.permanent ? '♾️ Our room' : 'Room code'}</p>
          <button onClick={() => copy('code')} className="font-display text-5xl font-bold tracking-[0.25em] pl-[0.25em] hover:opacity-80" aria-label="Copy room code">
            {room.code}
          </button>
          <p className="text-xs muted break-all select-all">{link}</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button className="btn btn-primary" onClick={() => copy('link')}>
              {copied === 'link' ? <Check className="size-4" /> : <Copy className="size-4" />}{copied === 'link' ? 'Copied!' : 'Copy invite link'}
            </button>
            {(android || 'share' in navigator) && <button className="btn btn-ghost" onClick={share}><Share2 className="size-4" />Share</button>}
          </div>
          {copied === 'code' && <p className="text-xs font-bold text-emerald-600">Code copied</p>}
          {room.permanent && <p className="text-xs muted">This code works forever. Join with the same name each time to get your seat back.</p>}
        </section>

        <section className="card p-2">
          <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Game">
            {([['ludo', '🎲 Ludo'], ['tot', '💞 This or That']] as const).map(([k, label]) => (
              <button key={k} role="radio" aria-checked={room.kind === k} onClick={() => room.kind !== k && act('room:kind', { kind: k })}
                className={`rounded-2xl py-3 font-extrabold transition ${room.kind === k ? 'bg-[color-mix(in_srgb,var(--color-rose)_16%,transparent)] ring-2 ring-[var(--color-rose)]' : 'btn-ghost muted'}`}>
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="card p-4 space-y-2">
          <h2 className="font-display text-lg font-semibold px-1">Players <span className="muted text-sm">{room.players.length}/{room.maxPlayers}</span></h2>
          {Array.from({ length: room.maxPlayers }, (_, i) => room.players[i]).map((p, i) => p ? (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl p-2.5" style={{ background: `${COLOR_HEX[p.color]}14` }}>
              <Avatar p={p} />
              <div className="flex-1 min-w-0">
                <p className="font-extrabold truncate">{p.name}{p.id === myId && <span className="muted font-semibold"> (you)</span>}</p>
                <p className="text-xs muted font-bold capitalize">{isLudo ? p.color : 'player'}{room.hostId === p.id ? ' · host' : ''}{!p.connected ? ' · offline' : ''}</p>
              </div>
              {isLudo && <span className={`text-xs font-extrabold rounded-full px-2.5 py-1 ${p.ready ? 'bg-emerald-500 text-white' : 'btn-ghost muted'}`}>{p.ready ? 'Ready' : 'Not ready'}</span>}
            </div>
          ) : (
            <div key={`empty${i}`} className="flex items-center gap-3 rounded-2xl p-2.5 border-2 border-dashed border-[var(--line)]">
              <span className="size-11 rounded-full btn-ghost animate-pulse" />
              <p className="muted font-bold">Waiting for someone to join…</p>
            </div>
          ))}
        </section>

        {isLudo ? (<>
        <button className={`btn w-full !min-h-14 text-lg ${me?.ready ? 'btn-ghost' : 'btn-primary'}`} onClick={() => act('room:ready', { ready: !me?.ready })}>
          {me?.ready ? 'Not ready yet' : "I'm ready! 🎲"}
        </button>
        {isHost && room.maxPlayers > 2 && room.players.length < room.maxPlayers && (
          <button className="btn btn-ghost w-full" disabled={!allReady} onClick={() => act('room:start')}>
            <Play className="size-4" />Start with {room.players.length} players
          </button>
        )}
        <p className="text-center text-xs muted">The game starts when everyone is ready.</p>
        </>) : (
        <section className="card p-4 space-y-3">
          <div>
            <h2 className="font-display text-lg font-semibold">💞 Choose a deck</h2>
            <p className="text-sm muted">Each card has two options. You both pick secretly, then see if you match.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {TOT_CATEGORIES.map((c: TotCategory) => (
              <button key={c} className="btn btn-ghost !min-h-20 flex-col !gap-0.5 !rounded-2xl text-sm" disabled={room.players.length < 2}
                onClick={() => (c === 'naughty' && !adultOk() ? setGate(true) : act('tot:draw', { category: c }))}>
                <span className="text-xl">{TOT_LABELS[c].emoji}</span>{TOT_LABELS[c].name}
              </button>
            ))}
          </div>
          {room.players.length < 2 && <p className="text-xs muted text-center">Opens when your partner joins.</p>}
        </section>
        )}
        {gate && <AdultGate onNo={() => setGate(false)} onYes={() => { setGate(false); void act('tot:draw', { category: 'naughty' }); }} />}
      </div>
    </main>
  );
}
