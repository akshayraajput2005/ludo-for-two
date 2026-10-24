# Ludo for Two 🎲❤️

**Play:** https://ludo-for-two.vercel.app · **Android app:** https://ludo-for-two.vercel.app/LudoForTwo.apk
· **Game server:** https://ludo-for-two-api.onrender.com (Render free, Singapore)

Deploying updates: after `git push`, open the Render dashboard → ludo-for-two blueprint → **Manual sync** (or the
service → **Manual Deploy**) to update the server; run
`vercel deploy --prod --scope akshaysinghh2005-1376` in this folder to update the website.
Permanent room: codes listed in the Render env var `PERMANENT_ROOMS` (comma-separated) always exist and never expire.
Join with the same name as before to get your seat back; switch between Ludo and This or That in the lobby.
On a laptop, open the site in Chrome/Edge and use "Install as an app" to get a desktop app.

A private, real-time online Ludo game for two people (up to 4) on any phone, tablet, or laptop.
The server is the referee: it rolls the dice, checks every move, and keeps the official game state.
The browser only draws the board and sends "roll" or "move token N".

```
ludo-online/
  shared/board.ts          board constants used by both sides (track length, start squares, safe squares)
  server/src/
    game/rules.ts          ⚙️ the ruleset, all in one place
    game/engine.ts         pure game logic: roll, move, capture, win, forfeit
    game/dice.ts           crypto-secure dice
    rooms/rooms.ts         in-memory rooms, players, reconnect tokens, expiry
    sockets/handlers.ts    Socket.IO events, validation, rate limits
    index.ts               Express + Socket.IO server; also serves the built client
    tests/                 engine unit tests + Socket.IO integration tests
  client/src/
    pages/                 Home, Lobby, Game screens
    components/            Board (SVG), Dice, Chat, small UI bits
    game/geometry.ts       15×15 board coordinates for every square
    hooks/useRoom.ts       connection, rejoin, room state
    services/              socket client, synthesized sounds
  render.yaml              one-click Render deploy
```

---

## 1. Run it on your computer

You need **Node.js 20 or newer** ([nodejs.org](https://nodejs.org), pick "LTS").

```bash
cd ludo-online
npm run build      # installs everything and builds the client
npm start          # → http://localhost:3001
```

Open http://localhost:3001, create a room, then open the invite link in a **private/incognito window**
to play the second player yourself. (Two normal tabs in the same browser work too, but a closed tab
reopens as whoever joined last in that browser.)

**Play from your phone on the same Wi-Fi:** find your computer's local IP (`ipconfig` on Windows,
look for IPv4, e.g. `192.168.1.20`) and open `http://192.168.1.20:3001` on the phone.
Windows may ask to allow Node through the firewall — allow it on private networks.

### Development mode (hot reload)

Two terminals:

```bash
npm run dev:server   # game server on :3001, restarts on change
npm run dev:client   # Vite on :5173, proxies the socket to :3001
```

Open http://localhost:5173.

### Tests

```bash
npm test
```

32 tests: 200 complete random games (2 and 4 players), dice, leaving base, movement, exact finish, home column, capture, safe squares, extra turns,
three sixes, winner, out-of-turn moves, full rooms, forged reconnect tokens, refresh/rejoin, duplicate
simultaneous moves, forfeit, rematch, and chat sanitizing. The socket tests start a real server on a
random port and connect real Socket.IO clients.

---

## 2. Put it online (so she can join from anywhere)

The simplest, recommended setup is **one Render web service** that runs the server and serves the
game page. One URL, no CORS setup. (Vercel alone can't host this: it doesn't keep WebSocket
connections open.)

1. Put this folder on GitHub:
   ```bash
   cd ludo-online
   git init && git add . && git commit -m "Ludo for Two"
   ```
   Create an empty repo on github.com, then follow its "push an existing repository" commands.
2. Go to [render.com](https://render.com), sign in with GitHub.
3. **New → Blueprint** → choose the repo. Render reads `render.yaml` and creates the service.
   *(Or **New → Web Service** manually with: Build command `npm run build`, Start command `npm start`,
   Health check path `/health`.)*
4. Wait for "Live", then open the `https://….onrender.com` URL it gives you. That's your game.

**Free plan caveat:** a free Render service sleeps after ~15 minutes without visitors. The first visit
then takes up to a minute to wake it (the page shows "Connecting…"). A sleeping or restarted server
also forgets all rooms (see Limitations). Open the site a minute before you play, or use a paid plan.

### Optional: client on Vercel, server on Render

Only if you want the page served from Vercel's CDN:

1. Deploy the server on Render as above and set env var `ALLOWED_ORIGINS=https://your-app.vercel.app`.
2. On Vercel, import the repo with **Root Directory** `client`, framework **Vite**, and env var
   `VITE_SERVER_URL=https://your-server.onrender.com`.
3. In **Root Directory** settings, enable "Include files outside the root directory" (the client imports `../shared`).

See `.env.example` for all variables. There are no secrets to configure.

---

## 3. Playing together

1. Open the game URL, type your name, pick an avatar, choose **2 players**, tap **Create private room**.
2. Tap **Copy invite link** (or **Share** on a phone) and send it to her on WhatsApp/Instagram/etc.
   She can also go to the site, tap **Join room**, and type the 6-letter code.
3. You both tap **I'm ready!** — the game starts.
4. On your turn tap the dice (or press <kbd>Space</kbd> on a laptop), then tap a glowing token.
5. Chat, quick messages (❤️ Love you!), and floating emoji reactions are in the side panel on laptops
   and behind the 💬 button on phones. 🔊 mutes sounds, 🎵 toggles soft background music.
6. After the game, both tap **Rematch** to play again with the same room.

If a phone locks, a page refreshes, or Wi-Fi drops, just reopen the same link: you're put back in your
seat with the current board. The other player sees you as "offline" meanwhile, and the game waits.
Leaving with the **Leave** button during a game forfeits it.

---

## 4. Game rules

All switches live in `server/src/game/rules.ts`.

| Rule | Setting |
|---|---|
| Tokens per player | 4, all start in base |
| Leaving base | Needs a **6**; the token goes to its start square |
| Rolling a 6 | Roll again |
| Three 6s in a row | Third 6 is cancelled and the turn passes (`threeSixesForfeit`) |
| Capture | Landing on an opponent's token sends it back to base; you roll again |
| Safe squares | The 4 start squares and the 4 ★ star squares: no captures there; any colors can share them |
| Home column | After 51 squares on the main track a token turns into its own 5-square colored lane; it can't be captured there |
| Finishing | Exact roll needed to reach the center. Bringing a token home gives another roll |
| No legal move | Turn passes (a 6 still lets you roll again) |
| Stacking | Your own tokens may share a square. No blockades (they don't block anyone) |
| Winning | First to bring all 4 tokens home wins; the game ends there |
| Leaving | Leaving mid-game forfeits; with one player left, they win |
| Seats | 2 players: red vs yellow (opposite corners). 3: red/green/yellow. 4: all |

---

## 5. Security

- Dice come from `crypto.randomInt` on the server; anything the client sends as a dice value is ignored.
- Every event checks the socket is bound to a seated player in that room, that it's their turn,
  the phase (roll vs. move), and that the token is in the server-computed legal list.
- Moves carry the state `version` they were made against, so double taps and stale clicks are rejected,
  and only one of several simultaneous attempts can apply.
- Each player gets a random 192-bit reconnect secret (only sent to them). Rejoining requires it, so
  nobody can take over a seat by knowing the room code. The 6-letter room code + "room full" check is what keeps the room private.
- Names and chat are length-limited and stripped of control characters; React escapes all output.
  Avatars and reactions must be from fixed lists.
- Rate limits per connection: 10 game actions/sec, 5 chat messages per 5 s, 5 create/join attempts per 10 s.
- CORS is limited to `ALLOWED_ORIGINS`. Secrets are never logged or broadcast.

## 6. Limitations

- **Rooms live in server memory.** A restart, redeploy, or free-tier sleep ends all games in progress.
  Rooms are also deleted after 30 minutes with nobody connected, or 12 hours without activity.
  To add persistence, replace the few functions in `server/src/rooms/rooms.ts` (`createRoom`,
  `getRoom`, `deleteRoom`, `sweep`) with Redis/DB calls and save the room after each handled event.
- One server instance only (the Map isn't shared between instances).
- No accounts by design: identity is the per-room secret stored in the browser.

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| Stuck on "Connecting to the server…" | Free Render server is waking up: wait ~60 s. Check `https://your-app.onrender.com/health` shows `{"ok":true}`. |
| "Room not found" | The server restarted or the room expired. Create a new room. |
| "This game has already started" | Someone else already took the second seat. Use a new room. |
| "Opened somewhere else" | The same seat was opened in another tab/device. Tap **Play here** on the one you want. |
| Banner "Connection lost — reconnecting…" | Your network dropped. It reconnects on its own; the game is safe on the server. |
| Works on Wi-Fi at home but not the deployed site | Use the `https://` URL. If client and server are on different domains, `ALLOWED_ORIGINS` must exactly match the client URL (no trailing `/`). |
| No sound on iPhone | Tap anywhere first (browsers only allow audio after a tap), make sure the silent switch is off, and check 🔊 isn't muted. |
| Phone on the same Wi-Fi can't open `http://<pc-ip>:3001` | Allow Node.js in Windows Firewall for private networks, and check both are on the same network (not guest Wi-Fi). |
| Board too small / cut off on a phone | Rotate to landscape for a bigger board, or close the browser's tab bar. Report the phone model and screen size if it's cut off. |
