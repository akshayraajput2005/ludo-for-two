import type { ReactNode } from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import type { Conn } from '../hooks/useRoom';
import { COLOR_HEX, type PublicPlayer } from '../game/types';

export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="card pop-in w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function ConnBadge({ conn, compact }: { conn: Conn; compact?: boolean }) {
  const map = {
    connected: { label: 'Connected', cls: 'text-emerald-600 dark:text-emerald-400', icon: <Wifi className="size-3.5" /> },
    connecting: { label: 'Connecting', cls: 'text-amber-600', icon: <Loader2 className="size-3.5 animate-spin" /> },
    reconnecting: { label: 'Reconnecting', cls: 'text-amber-600', icon: <Loader2 className="size-3.5 animate-spin" /> },
    disconnected: { label: 'Disconnected', cls: 'text-red-600', icon: <WifiOff className="size-3.5" /> },
  }[conn];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${map.cls}`} role="status" title={map.label}>
      {map.icon}{compact && conn === 'connected' ? <span className="sr-only">{map.label}</span> : map.label}
    </span>
  );
}

export function Avatar({ p, size = 'md', active }: { p: PublicPlayer; size?: 'sm' | 'md' | 'lg'; active?: boolean }) {
  const s = { sm: 'size-8 text-lg', md: 'size-11 text-2xl', lg: 'size-16 text-4xl' }[size];
  return (
    <span
      className={`relative grid place-items-center rounded-full shrink-0 ${s} ${p.connected ? '' : 'grayscale opacity-60'}`}
      style={{ background: `${COLOR_HEX[p.color]}22`, boxShadow: `0 0 0 ${active ? 3 : 2}px ${COLOR_HEX[p.color]}` }}
    >
      {p.avatar}
      {!p.connected && !p.left && <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-zinc-400 ring-2 ring-[var(--card)]" title="Offline" />}
    </span>
  );
}

export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-[max(env(safe-area-inset-top),1rem)] z-[70] pop-in">
      <button onClick={onDone} className="card px-4 py-2.5 text-sm font-bold shadow-lg">{text}</button>
    </div>
  );
}
