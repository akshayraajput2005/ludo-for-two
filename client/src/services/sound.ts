// Synthesized sounds via Web Audio: no files to load. The AudioContext is only
// created/resumed inside a user gesture, which is what mobile browsers require.
let ctx: AudioContext | null = null;
let muted = load('ludo:muted', false);
let musicOn = load('ludo:music', false);
let musicTimer: number | undefined;

function load(key: string, dflt: boolean) {
  try { const v = localStorage.getItem(key); return v === null ? dflt : v === '1'; } catch { return dflt; }
}
function save(key: string, v: boolean) { try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* ignore */ } }

export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  if (musicOn && !musicTimer) startMusic();
}

function tone(freq: number, dur: number, { type = 'sine' as OscillatorType, vol = 0.15, at = 0, slide = 0 } = {}) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  dice() { if (muted) return; for (let i = 0; i < 6; i++) tone(180 + Math.random() * 260, 0.05, { type: 'square', vol: 0.05, at: i * 0.07 }); },
  step() { if (!muted) tone(660, 0.06, { type: 'triangle', vol: 0.08 }); },
  capture() { if (!muted) { tone(520, 0.25, { type: 'sawtooth', vol: 0.08, slide: 0.3 }); tone(260, 0.3, { vol: 0.12, at: 0.08, slide: 0.5 }); } },
  home() { if (!muted) [660, 880, 1100].forEach((f, i) => tone(f, 0.15, { type: 'triangle', vol: 0.1, at: i * 0.08 })); },
  win() { if (!muted) [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.12, at: i * 0.13 })); },
  pop() { if (!muted) tone(900, 0.08, { vol: 0.07, slide: 1.5 }); },
};

export const isMuted = () => muted;
export function setMuted(v: boolean) { muted = v; save('ludo:muted', v); if (v) stopMusic(); else if (musicOn) startMusic(); }

export const isMusicOn = () => musicOn;
export function setMusic(v: boolean) { musicOn = v; save('ludo:music', v); if (v) { unlockAudio(); startMusic(); } else stopMusic(); }

// Soft looping arpeggio, Cmaj7 -> Am7 -> Fmaj7 -> G.
const CHORDS = [[261.6, 329.6, 392, 493.9], [220, 261.6, 329.6, 392], [174.6, 220, 261.6, 329.6], [196, 246.9, 293.7, 392]];
function startMusic() {
  if (musicTimer || muted || !ctx) return;
  let bar = 0;
  const playBar = () => {
    CHORDS[bar++ % CHORDS.length].forEach((f, i) => tone(f, 0.9, { vol: 0.035, at: i * 0.5 }));
  };
  playBar();
  musicTimer = window.setInterval(playBar, 2000);
}
function stopMusic() { clearInterval(musicTimer); musicTimer = undefined; }
