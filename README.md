# 🇮🇳 Bharat-Power-Politics — The Race for 272

A complete **multiplayer political strategy game** for India's 543 Lok Sabha constituencies, inspired by the gameplay and presentation of *270*. Up to 7 players (plus optional AI parties) campaign simultaneously through timed rounds, then face **election night**, where all 543 seats are declared live.

> **All parties, leaders and constituency names are fictional.** Demographic numbers are approximate game data, not census statistics. Not affiliated with the game *270* or any real party.

---

## 1. Quick start (Windows)

1. Install **Node.js 18+ (LTS)** from <https://nodejs.org>.
2. Unzip the project, then double-click **`setup.bat`** (creates `.env` with a random secret, runs `npm install`, creates the database).
3. Double-click **`run.bat`** → the browser opens at <http://localhost:3000>.
4. Create an account → *Solo vs 3 AI* to try it alone, or *Create room* and share the 5-letter code.

Optional: **`test.bat`** runs the automated tests (see §9 for what has/hasn't been verified).

**Playing with friends**
- Same Wi-Fi/LAN: friends open `http://<your-PC-IP>:3000` (find it with `ipconfig`; allow Node.js through Windows Firewall when prompted).
- Over the internet: host on any Node-capable server/VPS (or tunnel with a tool such as Cloudflare Tunnel / ngrok). Put it behind HTTPS (e.g. Caddy/nginx), set a strong `JWT_SECRET` and `CORS_ORIGIN` in `.env`.

**macOS/Linux:** `npm install && node scripts/setup-env.js && npm start`.

---

## 2. Gameplay

### Round structure
A game has 4–20 rounds ("campaign weeks", default 10). All players act **simultaneously** with 6 Action Points. A round resolves when everyone clicks **End turn** or the **timer** (optional) expires. After the last round, **polling day** decides all 543 seats by first-past-the-post.

### Actions
| Action | Cost | Effect |
|---|---|---|
| 📣 Rally | 1 AP, ₹8 cr, 14 leader energy | Local momentum (charisma & energy matter, diminishing returns, 15% spill-over to the rest of the state, fades ~35%/round) |
| 🏘️ Booth workers | 1 AP, ₹5 cr | Lasting local organisation (barely decays) |
| 📺 Targeted ad | 1 AP, ₹10 cr | Boosts one voter group in every seat of a state (weighted by that group's share per seat) |
| 📊 State poll | 1 AP, ₹12 cr | Accurate seat-by-seat numbers (free intel is very noisy) |
| 💰 Fundraise | 1 AP | +≈₹26 cr; raises *donor heat*; at 100% a scandal hits your leader rating |
| 🧘 Rest | 1 AP | +30 leader energy |
| 🗡️ Attack | 1 AP, ₹12 cr | 62% to dent a rival's rating; otherwise it **backfires** on you. 1/round, never the same target twice in a row, never an ally |
| 📜 Manifesto | free (Round 1) | 6 issue positions (−2…+2). Eight voter groups have preferences/importances per issue. Over-promising (>6 fiscal points) and flip-flopping after Round 1 (−5% credibility, max 2/round) hurt |
| 🏛️ Budget | incumbent only | Tax rate, deficit target and six sector allocations (±8 points/sector, ±3 tax, ±1 deficit per round) drive the economy |
| 🤝 Alliances | free | Up to 3 parties; in each seat the strongest ally receives 60% of partners' votes; allies can't attack each other; locked in the final 2 rounds |

### The nation
GDP growth, inflation, unemployment, debt, health, education, infrastructure, welfare, agriculture and security evolve every round from the budget plus random events (monsoon, oil shock, cyclone, farmers' protest, scandals, viral speeches…). They produce **national approval** and **approval per voter group**; the incumbent party is rewarded or punished in each seat according to that seat's demographics.

### Voting model (summary)
For each party *p* in constituency *c*:
`score = 1.5·regional base + 2.6·policy fit (demographic-weighted) + 1.4·group appeal + 1.1·leader rating + 1.2·ads + 1.1·organisation + 1.5·momentum (+ incumbent term from approval)`.
Vote shares are a softmax of scores (minus an "others" share). On polling day each seat gets its own random noise plus a late national swing per party, so polls can be wrong. Alliance transfers are applied before picking the winner.

### Victory
- **272+ seats** (alone or as an alliance) → majority government; **362+** → landslide.
- Otherwise the largest bloc leads a **hung parliament** (tie-break: vote share).
- The Prime Minister party is rank 1; coalition partners are marked 🤝.

### Leaderboard & ranking
Points per ranked game: `seat share × 100` (+40 PM party, +20 more for a majority; +15 for coalition partners). A game is **ranked** only if it has **≥2 human players**, **≥6 rounds**, and the player was not on autopilot for >30% of rounds; max **5 ranked games per player per day** (`RANKED_GAMES_PER_DAY`). Solo-vs-AI games are practice only.

---

## 3. Anti-exploit & fairness measures

- **Server-authoritative engine.** Clients only send *requests*; every action is re-validated (ownership, AP, funds, energy, integer/enum ranges, prototype-pollution-safe action lookup).
- **Fog of war.** Other parties' funds, AP, energy and local strengths are never sent. Players only get their own noisy intel; precise polls cost AP + funds and go stale.
- **Spending cap per constituency** (₹60 cr per party for the whole campaign) and per-round limits (2 rallies/seat, 2 fundraises, 1 attack, 2 policy changes) stop "spam one seat" strategies; momentum has diminishing returns.
- **Anti-hoarding:** funds above ₹200 cr decay 15%/round. **Catch-up income** for trailing parties.
- **Hidden randomness:** RNG state lives only on the server (seeded per room).
- **No actions after End turn;** no budget changes by non-incumbents; budget moves are step-limited.
- **Alliance rules:** max size 3, locked in final rounds, no attacking allies, leaving costs rating.
- **AFK handling:** disconnected players are auto-readied after 60 s; two missed rounds → AI autopilot (resumes when you act). Rooms abandoned for 10 min are closed.
- **Rate limits:** per-user socket event and action limiters, chat limiter, login/register limiter; payload size caps; bcrypt password hashing; JWT sessions; one live tab per account; one room per account.
- **Ranked-farming protection:** see leaderboard rules above.
- Honest limitation: multiple accounts controlled by one person (collusion/sock-puppets) cannot be fully prevented by game rules alone; add email verification/IP heuristics if you host publicly.

---

## 4. Architecture

```
Browser (vanilla ES modules, SVG map)  ⇄  Socket.IO + REST  ⇄  Node.js/Express
                                                              ├─ engine/ (pure game logic, no I/O)
                                                              ├─ rooms.js (rooms, timers, persistence)
                                                              └─ sql.js SQLite file (data/bharat.sqlite)
```

| Concern | Technology (all free/open-source) |
|---|---|
| Backend | Node.js, Express 5, Socket.IO 4 |
| Database | SQLite via **sql.js** (pure WebAssembly — no native compile on Windows). Flushed atomically to disk (debounced) and on shutdown |
| Auth | bcryptjs + JSON Web Tokens |
| Frontend | Vanilla JS ES modules, SVG, CSS animations (no build step, works offline, no CDN) |
| Tests | `node:test`, socket.io-client, optional jsdom + esbuild |

### Folder layout
```
server/
  index.js            HTTP API + static files + socket server bootstrap
  rooms.js            Rooms, socket events, timers, persistence, ranked scoring
  auth.js db.js schema.sql config.js
  engine/             constants, model (voting), economy, events, actions (validated), bots (AI), game (lifecycle), view (fog-of-war)
  data/               states, parties, issues/groups, mapLayout (cartogram packer), constituencies (generator)
public/               index.html, css/style.css, js/{main,api,ui,map}.js, js/screens/{auth,home,lobby,game,election}.js
tests/                engine.test.js, socket.test.js, ui-smoke.js, simulate.js, baseline.js
scripts/              init-db.js, setup-env.js, print-port.js
setup.bat run.bat test.bat  .env.example
```

### Database schema (`server/schema.sql`)
`users`, `games` (status + JSON snapshot for crash recovery), `game_players`, `game_results`, `constituency_results` (543 rows per finished game), `action_log` (audit trail of every action attempt), `user_stats` (leaderboard), `chat_messages`. The schema is applied automatically on start; `npm run init-db` creates the file without starting the server. Unfinished games are restored from `state_json` after a server restart.

### Socket API (client → server)
`room:create|join|leave|party|ready|addBot|remove|settings|start`, `game:action {type:…}`, `chat:send`. Server → client: `state` (personalised view), `toast`, `chat`, `round`, `election`.

---

## 5. Configuration (`.env`)
| Key | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | HTTP/WebSocket port |
| `JWT_SECRET` | *(generated by setup.bat)* | **Must** be long & random in production |
| `DB_FILE` | data/bharat.sqlite | Database path |
| `JWT_EXPIRES` | 7d | Session length |
| `CORS_ORIGIN` | * | Restrict when hosting publicly |
| `MAX_ROOMS` | 200 | Concurrent rooms |
| `RANKED_GAMES_PER_DAY` | 5 | Leaderboard farming cap |

---

## 6. ⚠️ Replacing the map data (important)

**What ships:** I could not download an authoritative India boundary/constituency dataset, so the game uses a **generated seat-cartogram**: 543 squares (one per constituency, with the correct *number of seats per state/UT* totalling 543), grouped by state and placed near each state's real geographic position by a spiral packer (`server/data/mapLayout.js`). It is fully playable and clickable, but it is **not geographically accurate**, and **constituency names, demographics and party strengths are synthetic**.

**A. Add real state boundaries (easy, no code).** Put a GeoJSON of Indian states at `data/india-states.geojson` (properties `st_nm`, `NAME_1`, `ST_NM`, `name` or `STATE` are recognised; names are matched to the 36 states/UTs with common aliases). Restart → a **🌐 Geo/Cartogram** toggle appears above the map; states are coloured by projected/final leader, and clicking a state jumps to its seats. Free sources: Natural Earth admin-1, GADM (India level 1), DataMeet / Survey-of-India derived datasets — check each licence and Indian map-depiction rules.

**B. Real constituency names/attributes.** Create `data/constituencies.override.json`:
```json
[ { "id": "UP-01", "name": "Varanasi", "urban": 0.45, "electorate": 1.9, "turnout": 0.6 } ]
```
Ids are `<STATE>-<NN>` (`UP-01`…`UP-80`). Any generated field (`g` = 8 voter-group weights summing to 1, `base` party strengths, `sigma` volatility, `others`) can be overridden.

**C. True constituency polygons.** Extend `public/js/map.js → createGeoMap` to draw per-constituency paths (id = `<STATE>-<NN>`) and add a `constituency` GeoJSON endpoint like `/api/geo`; the engine needs no change because it only knows constituency ids.

**D. Real/realistic election history.** Replace the `strength` tables in `server/data/parties.js` (state level) or override `base` per constituency in the override file.

---

## 7. Customising
- **Parties/leaders/manifestos:** `server/data/parties.js` (IDs are used everywhere; up to 7 are playable; to add more edit `maxPlayers` limits in `engine/game.js` and `settings`).
- **Issues & voter groups:** `server/data/issues.js` (matrix of group preferences & importance).
- **Random events:** `server/engine/events.js`. **Costs/limits:** `server/engine/constants.js`. **Voting weights:** `server/engine/model.js → scores()`.
- **Balance check:** `npm run baseline` (no-campaign projections for 2/3/5/7 parties) and `npm run simulate -- 20 7 10` (AI-only games, prints seat results).

---

## 8. Known limitations / ideas for next steps
- Map is a cartogram unless you add GeoJSON (see §6); no true constituency boundaries.
- Spectator mode, replays of saved elections, private-message chat, emoji/sound effects and a mobile-optimised layout are not implemented (layout is responsive but was not tuned on phones).
- AI is heuristic (marginal-seat targeting, manifesto hill-climbing at *hard*); it is a sparring partner, not a strong player.
- Single-process server (rooms are in memory + snapshotted to SQLite). Scaling horizontally would need sticky sessions or Redis adapter.
- No email/password recovery or moderation UI (set `users.banned = 1` in the DB to ban an account).
- No i18n; text is English only.

---

## 9. Verification status — please read
I ran these in my build environment (Linux, Node 22):

| Check | Result |
|---|---|
| `npm install` of all dependencies | ✅ succeeded |
| Data integrity (543 seats, 36 states/UTs, non-overlapping map cells) | ✅ |
| Engine unit tests (rallies, caps, validation/exploit payloads, budget rules, turn lifecycle, timer/autopilot, alliances, full game, ranked-farming guard) | ✅ 10/10 pass |
| End-to-end socket test: auth, rooms, host-only controls, 2 humans + AI, 6 rounds, polls, election, DB rows (543 constituency results), leaderboard, history, fog-of-war | ✅ 4/4 pass |
| AI-only balance simulations (7 parties × 10 rounds, ~1.5 s each) | ✅ completes; seat totals always 543 |
| UI smoke test in **jsdom** (login → solo game → click seat → actions → all tabs → 10 rounds → election night → results → explore; plus GeoJSON toggle with a synthetic file) | ✅ no JS errors |

**Not verified (I could not do these here):**
- Running in a **real browser**: visual polish, CSS layout, animations, SVG performance, pinch/drag on touch screens, canvas confetti. Expect small visual bugs; the UI logic itself ran without errors in jsdom.
- **`setup.bat`, `run.bat`, `test.bat` on Windows** (written carefully and given CRLF line endings, but never executed), and `npm install` on Windows.
- More than 2 human players simultaneously, long sessions, reconnect/refresh mid-game in a real browser, server restarts mid-game (restore logic is implemented but only lightly exercised), load/security testing, and real GeoJSON files.
- Game balance with human players (only AI-vs-AI simulation and a baseline projection were checked; niche parties HKP/LSM/NAP are intentionally harder).

If something fails on your machine, run `test.bat` and check the server console — errors are logged with context.

## 10. License
MIT for the source code in this project. Check the licences of any map data you add.
