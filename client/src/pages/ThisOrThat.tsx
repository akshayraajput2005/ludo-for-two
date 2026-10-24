import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2, SkipForward } from 'lucide-react';
import { QUESTIONS, TOT_CATEGORIES, TOT_LABELS, type TotCategory } from '../../../shared/questions.ts';
import type { RoomState } from '../game/types';
import { emit } from '../services/socket';
import { sfx, unlockAudio } from '../services/sound';
import type { Conn, Reaction } from '../hooks/useRoom';
import { Avatar, ConnBadge, Modal } from '../components/ui';
import { Reactions } from '../components/Chat';

interface Props {
  room: RoomState;
  myId: string;
  conn: Conn;
  reactions: Reaction[];
  onError: (m: string) => void;
}

const ADULT_KEY = 'ludo:adult-ok';
export const adultOk = () => { try { return localStorage.getItem(ADULT_KEY) === '1'; } catch { return false; } };

// 18+ gate: asks once per device before showing the Naughty deck.
export function AdultGate({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <Modal onClose={onNo}>
      <div className="text-5xl mb-2">🔞</div>
      <h2 className="font-display text-2xl font-semibold mb-2">Naughty questions are 18+</h2>
      <p className="muted mb-5">These are flirty, adult questions for couples. Confirm you're 18 or older to continue.</p>
      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1" onClick={onNo}>Not now</button>
        <button className="btn btn-primary flex-1" onClick={() => { try { localStorage.setItem(ADULT_KEY, '1'); } catch { /* ignore */ } onYes(); }}>I'm 18+</button>
      </div>
    </Modal>
  );
}

export default function ThisOrThat({ room, myId, conn, reactions, onError }: Props) {
  const tot = room.tot!;
  const card = QUESTIONS[tot.category][tot.q] ?? ['…', '…'];
  const active = room.players.filter((p) => !p.left);
  const others = active.filter((p) => p.id !== myId);
  const myPick = tot.revealed ? tot.picks[myId] : undefined;
  const iPicked = tot.picked.includes(myId);
  const match = tot.revealed && new Set(active.map((p) => tot.picks[p.id])).size === 1;
  const [localPick, setLocalPick] = useState<0 | 1 | null>(null);
  const [gate, setGate] = useState<TotCategory | null>(null);
  const [busy, setBusy] = useState(false);

  // New card -> clear my local highlight. Reveal -> sound.
  const cardKey = `${tot.category}:${tot.q}:${tot.rounds}`;
  useEffect(() => { if (!tot.revealed) setLocalPick(null); }, [tot.q, tot.category]); // eslint-disable-line react-hooks/exhaustive-deps
  const wasRevealed = useRef(tot.revealed);
  useEffect(() => {
    if (tot.revealed && !wasRevealed.current) (match ? sfx.home : sfx.pop)();
    wasRevealed.current = tot.revealed;
  }, [cardKey, tot.revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (ev: string, args: object = {}) => {
    unlockAudio();
    setBusy(true);
    const r = await emit(ev, args);
    setBusy(false);
    if (!r.ok) onError(r.error!);
  };
  const pick = (choice: 0 | 1) => { if (iPicked || tot.revealed) return; setLocalPick(choice); void act('tot:pick', { choice }); };
  const switchTo = (c: TotCategory) => {
    if (c === tot.category) return;
    if (c === 'naughty' && !adultOk()) return setGate(c);
    void act('tot:draw', { category: c });
  };

  const shown = tot.revealed ? myPick : localPick ?? undefined;
  const label = TOT_LABELS[tot.category];

  return (
    <main className="min-h-dvh safe-pad flex flex-col items-center">
      <div className="w-full max-w-lg flex flex-col gap-4 flex-1">
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost !min-h-9 !px-3 text-sm" onClick={() => act('tot:close')}><ArrowLeft className="size-4" />Lobby</button>
          <span className="font-display font-bold tracking-widest text-sm btn-ghost rounded-full px-3 py-1">{room.code}</span>
          <ConnBadge conn={conn} compact />
          <div className="flex-1" />
          <span className="text-sm font-extrabold" title="Matches / rounds">💞 {tot.matches}/{tot.rounds}</span>
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 rounded-full btn-ghost" role="tablist" aria-label="Question type">
          {TOT_CATEGORIES.map((c) => (
            <button key={c} role="tab" aria-selected={tot.category === c} onClick={() => switchTo(c)}
              className={`rounded-full py-2 text-xs sm:text-sm font-extrabold transition ${tot.category === c ? 'bg-[var(--card)] shadow' : 'muted'}`}>
              {TOT_LABELS[c].emoji} {TOT_LABELS[c].name}
            </button>
          ))}
        </div>

        <section key={cardKey} className="card p-5 sm:p-6 text-center space-y-5 pop-in">
          <p className="text-xs font-extrabold uppercase tracking-widest muted">{label.emoji} {label.name} · This or That?</p>
          <div className="grid gap-3">
            {([0, 1] as const).map((i) => {
              const who = tot.revealed ? active.filter((p) => tot.picks[p.id] === i) : [];
              const mine = shown === i;
              return (
                <div key={i} className="contents">
                {i === 1 && <p className="font-display text-2xl -my-1 muted" aria-hidden>or</p>}
                <button onClick={() => pick(i)} disabled={iPicked || tot.revealed || busy}
                  className={`relative rounded-2xl p-5 min-h-24 text-lg sm:text-xl font-extrabold transition border-2 disabled:cursor-default
                    ${mine ? 'border-[var(--color-rose)] bg-[color-mix(in_srgb,var(--color-rose)_14%,transparent)] scale-[1.02]' : 'border-[var(--line)] btn-ghost'}
                    ${!iPicked && !tot.revealed ? 'hover:border-[var(--color-rose)] active:scale-[.98]' : ''}`}>
                  {card[i]}
                  {who.length > 0 && (
                    <span className="flex justify-center gap-1.5 mt-3">{who.map((p) => <Avatar key={p.id} p={p} size="sm" />)}</span>
                  )}
                </button>
                </div>
              );
            })}
          </div>

          <div className="min-h-14 grid place-items-center" aria-live="polite">
            {tot.revealed ? (
              <div className="space-y-3">
                <p className="font-display text-2xl font-bold">{match ? "It's a match! 💞" : 'Opposites attract 😜'}</p>
                <button className="btn btn-primary" disabled={busy} onClick={() => act('tot:draw')}>Next question</button>
              </div>
            ) : iPicked ? (
              <p className="font-bold flex items-center gap-2">
                <Check className="size-4 text-emerald-500" />
                {others.every((p) => tot.picked.includes(p.id)) ? 'Revealing…' : <>Waiting for {others.map((p) => p.name).join(', ')} <Loader2 className="size-4 animate-spin" /></>}
              </p>
            ) : (
              <p className="font-bold">
                Pick one — it stays secret until {others.length ? others.map((p) => p.name).join(', ') : 'they'} pick{others.length === 1 ? 's' : ''} too.
                {others.some((p) => tot.picked.includes(p.id)) && <span className="block text-sm text-emerald-600 mt-1">{others.find((p) => tot.picked.includes(p.id))?.name} already picked ✓</span>}
              </p>
            )}
          </div>
          {!tot.revealed && (
            <button className="text-sm font-bold muted inline-flex items-center gap-1 hover:underline" onClick={() => act('tot:draw')}>
              <SkipForward className="size-4" />Skip this one
            </button>
          )}
        </section>

        <div className="flex justify-center"><Reactions onError={onError} /></div>
        <div className="relative flex-1 pointer-events-none" aria-hidden>
          {reactions.map((r, i) => (
            <span key={r.id} className="float-emoji" style={{ left: `${30 + ((r.id * 37 + i * 11) % 40)}%` }}>{r.emoji}</span>
          ))}
        </div>
      </div>
      {gate && <AdultGate onNo={() => setGate(null)} onYes={() => { const c = gate; setGate(null); void act('tot:draw', { category: c }); }} />}
    </main>
  );
}
