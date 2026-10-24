import { useCallback, useEffect, useState } from 'react';
import { emit, session, socket, type Ack, type Session } from '../services/socket';
import type { RoomState } from '../game/types';

export type Conn = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type Reaction = { id: number; playerId: string; emoji: string };

function setUrlRoom(code: string | null) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

export function useRoom() {
  const [conn, setConn] = useState<Conn>(socket.connected ? 'connected' : 'connecting');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [me, setMe] = useState<Session | null>(session.get);
  const [rejoining, setRejoining] = useState(() => !!session.get());
  const [notice, setNotice] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [auto, setAutoState] = useState(false); // Bot mode (server plays my turns)

  useEffect(() => {
    // Every (re)connect re-binds this socket to our seat; the server replies with fresh state.
    const onConnect = async () => {
      setConn('connected');
      const s = session.get();
      if (!s) return setRejoining(false);
      const res = await emit('room:rejoin', { code: s.code, secret: s.secret });
      if (res.transient) { // keep the seat and retry; never drop it over a network blip
        setTimeout(() => { if (socket.connected) void onConnect(); }, 2000);
        return;
      }
      if (!res.ok) {
        session.clear();
        setMe(null);
        setRoom(null);
        setNotice(res.error ?? 'Could not rejoin');
      } else setAutoState(!!res.auto);
      setRejoining(false);
    };
    const onDisconnect = (reason: string) =>
      // Server-side kick (seat opened in another tab) does not auto-reconnect.
      setConn(reason === 'io server disconnect' ? 'disconnected' : 'reconnecting');
    const onError = () => setConn((c) => (c === 'connecting' ? 'connecting' : 'reconnecting'));
    const onReaction = (r: Reaction) => {
      setReactions((list) => [...list.slice(-8), r]);
      setTimeout(() => setReactions((list) => list.filter((x) => x.id !== r.id)), 2300);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);
    socket.on('room:state', setRoom);
    socket.on('chat:reaction', onReaction);
    if (socket.connected) void onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
      socket.off('room:state', setRoom);
      socket.off('chat:reaction', onReaction);
    };
  }, []);

  const enter = (res: Ack) => {
    if (!res.ok || !res.code || !res.playerId || !res.secret) return res;
    const s = { code: res.code, playerId: res.playerId, secret: res.secret };
    session.set(s);
    setMe(s);
    setNotice(null);
    setAutoState(!!res.auto);
    setUrlRoom(res.code);
    return res;
  };

  const create = useCallback(async (name: string, avatar: string, maxPlayers: number) =>
    enter(await emit('room:create', { name, avatar, maxPlayers })), []);

  const join = useCallback(async (code: string, name: string, avatar: string) =>
    enter(await emit('room:join', { code, name, avatar })), []);

  // Drop the local seat without telling the server (e.g. stuck rejoining).
  const forget = useCallback(() => {
    session.clear();
    setMe(null);
    setRoom(null);
    setRejoining(false);
    setUrlRoom(null);
  }, []);

  const leave = useCallback(async () => {
    await emit('room:leave');
    session.clear();
    setMe(null);
    setRoom(null);
    setUrlRoom(null);
  }, []);

  const setAuto = useCallback(async (on: boolean) => {
    const res = await emit('player:auto', { on });
    if (res.ok) setAutoState(!!res.auto);
    return res;
  }, []);

  const reconnect = useCallback(() => { setConn('connecting'); socket.connect(); }, []);

  return { conn, room, me, rejoining, notice, reactions, auto, setAuto, create, join, leave, forget, reconnect };
}
