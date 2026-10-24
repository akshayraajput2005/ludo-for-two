import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { emit } from '../services/socket';
import { sfx } from '../services/sound';
import { COLOR_HEX, QUICK_CHAT, REACTIONS, type RoomState } from '../game/types';

interface Props {
  room: RoomState;
  myId: string;
  onError: (msg: string) => void;
}

export function Reactions({ onError }: { onError: (msg: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1" aria-label="Send a reaction">
      {REACTIONS.map((e) => (
        <button
          key={e}
          className="size-10 grid place-items-center text-xl rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition"
          onClick={async () => { const r = await emit('chat:react', { emoji: e }); if (!r.ok) onError(r.error!); }}
        >{e}</button>
      ))}
    </div>
  );
}

export default function Chat({ room, myId, onError }: Props) {
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const byId = new Map(room.players.map((p) => [p.id, p]));
  const lastId = room.chat.at(-1)?.id;

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
    if (lastId && room.chat.at(-1)?.playerId !== myId) sfx.pop();
  }, [lastId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (msg: string) => {
    if (!msg.trim()) return;
    const r = await emit('chat:send', { text: msg });
    if (!r.ok) onError(r.error!);
    else setText('');
  };

  return (
    <div className="flex flex-col min-h-0 h-full gap-2">
      <div ref={list} className="flex-1 min-h-24 overflow-y-auto space-y-1.5 pr-1" aria-live="polite">
        {room.chat.length === 0 && <p className="muted text-sm text-center py-6">Say hi 👋</p>}
        {room.chat.map((m) => {
          const p = byId.get(m.playerId);
          const mine = m.playerId === myId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[85%] rounded-2xl px-3 py-1.5 text-sm font-semibold break-words"
                style={{ background: p ? `${COLOR_HEX[p.color]}${mine ? '33' : '1c'}` : undefined }}
              >
                {!mine && <span className="block text-[11px] font-extrabold muted">{p?.avatar} {p?.name}</span>}
                {m.text}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]">
        {QUICK_CHAT.map((q) => (
          <button key={q} onClick={() => send(q)} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold btn-ghost">{q}</button>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <input className="input !min-h-11" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Message…" aria-label="Chat message" />
        <button className="btn btn-primary !px-3 shrink-0" aria-label="Send" disabled={!text.trim()}><Send className="size-4" /></button>
      </form>
    </div>
  );
}
