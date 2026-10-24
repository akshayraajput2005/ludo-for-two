import { useEffect, useState } from 'react';
import { Heart, Plus, LogIn, Loader2, Download } from 'lucide-react';
import { AVATARS } from '../game/types';
import type { Ack } from '../services/socket';
import { unlockAudio } from '../services/sound';
import type { Conn } from '../hooks/useRoom';
import { ConnBadge } from '../components/ui';
import { MY_ROOM_KEY } from '../hooks/useRoom';

interface Props {
  conn: Conn;
  notice: string | null;
  inviteCode: string | null;
  onCreate: (name: string, avatar: string, max: number, kind: 'ludo' | 'tot') => Promise<Ack>;
  onJoin: (code: string, name: string, avatar: string) => Promise<Ack>;
}

const PROFILE_KEY = 'ludo:profile';
function loadProfile(): { name: string; avatar: string } {
  try { return { name: '', avatar: AVATARS[0], ...JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') }; }
  catch { return { name: '', avatar: AVATARS[0] }; }
}

export default function Home({ conn, notice, inviteCode, onCreate, onJoin }: Props) {
  const saved = loadProfile();
  const [name, setName] = useState(saved.name);
  const [avatar, setAvatar] = useState(saved.avatar);
  const [tab, setTab] = useState<'create' | 'join'>(inviteCode ? 'join' : 'create');
  const [code, setCode] = useState(inviteCode ?? '');
  const [max, setMax] = useState(2);
  const [kind, setKind] = useState<'ludo' | 'tot'>('ludo');
  const [busy, setBusy] = useState(false);
  const myRoom = (() => { try { return localStorage.getItem(MY_ROOM_KEY); } catch { return null; } })();
  const [error, setError] = useState<string | null>(null);
  // Chrome/Edge offer "install as app"; we show our own button for it.
  const [installEvt, setInstallEvt] = useState<(Event & { prompt(): Promise<void> }) | null>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstallEvt(e as Event & { prompt(): Promise<void> }); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  const submit = async () => {
    unlockAudio();
    if (!name.trim()) return setError('Enter your name first');
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: name.trim(), avatar })); } catch { /* ignore */ }
    setBusy(true);
    setError(null);
    const res = tab === 'create' ? await onCreate(name, avatar, max, kind) : await onJoin(code, name, avatar);
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Something went wrong');
  };

  return (
    <main className="min-h-dvh safe-pad grid place-items-center">
      <div className="w-full max-w-md space-y-5 py-4">
        <header className="text-center space-y-2">
          <div className="flex justify-center gap-2 text-4xl" aria-hidden>
            <span className="inline-block -rotate-12">🎲</span><span className="inline-block text-[var(--color-rose)]"><Heart className="size-10 fill-current" /></span><span className="inline-block rotate-12">🎲</span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">Ludo for Two</h1>
          <p className="muted font-semibold">A private board, wherever you both are.</p>
          <ConnBadge conn={conn} />
        </header>

        {inviteCode && tab === 'join' && (
          <div className="card p-3 text-center font-bold bg-[color-mix(in_srgb,var(--color-rose)_10%,var(--card))]">
            💌 You've been invited to room <span className="font-display tracking-widest">{inviteCode}</span>
          </div>
        )}
        {(error || notice) && <p role="alert" className="card p-3 text-center text-sm font-bold text-red-600">{error || notice}</p>}

        <section className="card p-5 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-extrabold">Your name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="e.g. Akshay" autoComplete="nickname" />
          </label>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-extrabold">Pick an avatar</legend>
            <div className="grid grid-cols-6 gap-2">
              {AVATARS.map((a) => (
                <button
                  key={a} type="button" onClick={() => setAvatar(a)} aria-pressed={avatar === a} aria-label={`Avatar ${a}`}
                  className={`aspect-square rounded-2xl text-2xl grid place-items-center transition ${avatar === a ? 'bg-[color-mix(in_srgb,var(--color-rose)_18%,transparent)] ring-2 ring-[var(--color-rose)] scale-105' : 'btn-ghost'}`}
                >{a}</button>
              ))}
            </div>
          </fieldset>
        </section>

        {myRoom && !inviteCode && (
          <button className="btn btn-primary w-full !min-h-14 text-lg" disabled={busy || conn !== 'connected'}
            onClick={async () => {
              unlockAudio();
              if (!name.trim()) return setError('Enter your name first (the same one as last time)');
              try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: name.trim(), avatar })); } catch { /* ignore */ }
              setBusy(true); setError(null);
              const res = await onJoin(myRoom, name, avatar);
              setBusy(false);
              if (!res.ok) setError(res.error ?? 'Could not open the room');
            }}>
            ♾️ Open our room <span className="font-display tracking-widest">{myRoom}</span>
          </button>
        )}

        <section className="card p-5 space-y-4">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-full btn-ghost" role="tablist">
            {(['create', 'join'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`rounded-full py-2 font-extrabold text-sm transition ${tab === t ? 'bg-[var(--card)] shadow' : 'muted'}`}>
                {t === 'create' ? 'Create room' : 'Join room'}
              </button>
            ))}
          </div>

          {tab === 'create' ? (
            <div className="space-y-4">
            <div className="space-y-1.5">
              <span className="text-sm font-extrabold">Choose a game</span>
              <div className="grid grid-cols-2 gap-2">
                {([['ludo', '🎲', 'Ludo', 'Classic board game'], ['tot', '💞', 'This or That', 'Romantic · Intimacy · 18+']] as const).map(([k, emoji, title, sub]) => (
                  <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                    className={`rounded-2xl p-3 text-center transition border-2 ${kind === k ? 'border-[var(--color-rose)] bg-[color-mix(in_srgb,var(--color-rose)_12%,transparent)]' : 'border-transparent btn-ghost'}`}>
                    <span className="block text-3xl">{emoji}</span>
                    <span className="block font-extrabold">{title}</span>
                    <span className="block text-[11px] muted font-bold">{sub}</span>
                  </button>
                ))}
              </div>
            </div>
            {kind === 'ludo' && (
            <div className="space-y-1.5">
              <span className="text-sm font-extrabold">Players</span>
              <div className="flex gap-2">
                {[2, 3, 4].map((n) => (
                  <button key={n} onClick={() => setMax(n)} aria-pressed={max === n}
                    className={`btn flex-1 ${max === n ? 'btn-primary' : 'btn-ghost'}`}>{n}{n === 2 ? ' 💑' : ''}</button>
                ))}
              </div>
            </div>
            )}
            </div>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-sm font-extrabold">Room code</span>
              <input className="input font-display tracking-[0.3em] uppercase text-center text-xl" value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={6} placeholder="ABC234" autoCapitalize="characters" />
            </label>
          )}

          <button className="btn btn-primary w-full !min-h-12 text-lg" disabled={busy || conn !== 'connected' || (tab === 'join' && code.length !== 6)} onClick={submit}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : tab === 'create' ? <Plus className="size-5" /> : <LogIn className="size-5" />}
            {tab === 'join' ? 'Join game' : kind === 'ludo' ? 'Create Ludo room' : 'Create This or That room'}
          </button>
        </section>
        {installEvt && (
          <button className="btn btn-ghost w-full" onClick={() => { void installEvt.prompt(); setInstallEvt(null); }}>
            <Download className="size-4" />Install as an app on this device
          </button>
        )}
        {/Android/i.test(navigator.userAgent) && !('LudoAndroid' in window) && (
          <a className="btn btn-ghost w-full" href="/LudoForTwo.apk" download>
            <Download className="size-4" />Get the Android app (.apk)
          </a>
        )}
        <p className="text-center text-xs muted">No sign-up. Your name only lives in this game room.</p>
      </div>
    </main>
  );
}
