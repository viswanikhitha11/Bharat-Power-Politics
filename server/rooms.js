'use strict';
// Room manager: owns all live games, socket events, timers, persistence and anti-abuse checks.
const G = require('./engine/game');
const { view } = require('./engine/view');
const C = require('./engine/constants');
const cfg = require('./config');
const db = require('./db');
const auth = require('./auth');
const cons = require('./data/constituencies');
const { makeLimiter } = require('./util/ratelimit');

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const today = () => new Date().toISOString().slice(0, 10);

class Rooms {
  constructor(io) {
    this.io = io; this.games = new Map(); // code -> { st, dbId, sockets:Set, intelFlags:Set, dirty }
    this.userRoom = new Map();
    this.evLimit = makeLimiter(60, 10000);  // 60 events / 10s per user
    this.actLimit = makeLimiter(40, 5000);  // 40 game actions / 5s per user
    this.chatLimit = makeLimiter(6, 10000);
    io.use((socket, next) => {
      const u = auth.verify(String(socket.handshake.auth?.token || ''));
      if (!u) return next(new Error('unauthorized'));
      socket.user = u; next();
    });
    io.on('connection', s => this.onConnect(s));
    this.timer = setInterval(() => this.tickAll(), 1000); this.timer.unref();
    this.restore();
  }
  restore() {
    for (const r of db.all("SELECT * FROM games WHERE status IN ('lobby','playing') AND state_json IS NOT NULL")) {
      try {
        const st = JSON.parse(r.state_json);
        for (const s of st.seats) if (!s.bot) s.connected = false;
        this.games.set(r.code, { st, dbId: r.id, sockets: new Set(), intel: new Set(), saved: Date.now() });
        for (const s of st.seats) if (s.userId) this.userRoom.set(s.userId, r.code);
        if (st.deadline) st.deadline = Date.now() + (st.settings.timer || 60) * 1000; // fresh timer after restart
      } catch (e) { console.warn('[restore] failed for', r.code, e.message); }
    }
    if (this.games.size) console.log(`[rooms] restored ${this.games.size} game(s)`);
  }
  newCode() { let c; do { c = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); } while (this.games.has(c)); return c; }
  persist(g, finished = false) {
    const st = g.st;
    db.run('UPDATE games SET status=?, state_json=?, ranked=?, rounds_played=?, settings_json=? WHERE id=?',
      [st.phase === 'finished' ? 'finished' : st.phase, finished ? null : JSON.stringify(st), st.ranked ? 1 : 0, Math.max(0, st.round - 1), JSON.stringify(st.settings), g.dbId]);
    g.saved = Date.now();
  }
  emit(g, withIntel = false) {
    for (const sock of g.sockets) {
      const flag = withIntel || g.intel.has(sock.user.id);
      sock.emit('state', view(g.st, sock.user.id, flag));
    }
    g.intel.clear();
  }
  sockFor(g, userId) { for (const s of g.sockets) if (s.user.id === userId) return s; return null; }
  onConnect(socket) {
    const u = socket.user;
    const code = this.userRoom.get(u.id);
    // one live socket per user: kick older tab
    for (const [, g] of this.games) for (const s of [...g.sockets]) if (s.user.id === u.id && s !== socket) { s.emit('toast', { type: 'warn', text: 'Signed in from another tab.' }); g.sockets.delete(s); s.disconnect(true); }
    if (code && this.games.has(code)) this.attach(socket, this.games.get(code), true);
    else socket.emit('state', null);

    const h = (event, fn, opts = {}) => socket.on(event, async (payload, ack) => {
      const done = typeof ack === 'function' ? ack : () => {};
      try {
        if (!this.evLimit('e' + u.id)) return done({ ok: false, error: 'Too many requests - slow down.' });
        if (opts.action && !this.actLimit('a' + u.id)) return done({ ok: false, error: 'Too many actions - slow down.' });
        const r = fn(payload && typeof payload === 'object' ? payload : {}) || { ok: true };
        done(r);
      } catch (e) { console.error('[socket]', event, e); done({ ok: false, error: 'Server error.' }); }
    });
    const room = () => { const c = this.userRoom.get(u.id); return c ? this.games.get(c) : null; };

    h('room:create', p => {
      if (this.userRoom.has(u.id)) return { ok: false, error: 'Leave your current room first.' };
      if (this.games.size >= cfg.MAX_ROOMS) return { ok: false, error: 'Server is full, try later.' };
      const code = this.newCode();
      const st = G.create({ code, hostId: u.id, hostName: u.display_name, settings: p.settings });
      const dbId = db.insert('INSERT INTO games (code, host_user_id, status, settings_json, state_json) VALUES (?,?,?,?,?)', [code, u.id, 'lobby', JSON.stringify(st.settings), JSON.stringify(st)]);
      const g = { st, dbId, sockets: new Set(), intel: new Set(), saved: Date.now() };
      this.games.set(code, g); this.userRoom.set(u.id, code);
      this.attach(socket, g, false);
      return { ok: true, code };
    });
    h('room:join', p => {
      const code = String(p.code || '').toUpperCase().trim();
      const g = this.games.get(code);
      if (!g) return { ok: false, error: 'No room with that code.' };
      const cur = this.userRoom.get(u.id);
      if (cur && cur !== code) return { ok: false, error: 'Leave your current room first.' };
      const r = G.joinHuman(g.st, u.id, u.display_name);
      if (!r.ok) return r;
      this.userRoom.set(u.id, code); this.attach(socket, g, false);
      this.broadcastToast(g, `${u.display_name} joined.`);
      return { ok: true, code };
    });
    h('room:leave', () => { this.leaveRoom(socket); return { ok: true }; });
    h('room:party', p => { const g = room(); if (!g) return { ok: false, error: 'No room.' }; const r = G.chooseParty(g.st, u.id, p.pid); if (r.ok) this.changed(g); return r; });
    h('room:ready', p => { const g = room(); if (!g) return { ok: false }; const r = G.setReady(g.st, u.id, p.ready); if (r.ok) this.changed(g); return r; });
    h('room:addBot', p => { const g = room(); if (!g) return { ok: false }; const r = G.addBot(g.st, u.id, p.level, p.pid); if (r.ok) this.changed(g); return r; });
    h('room:remove', p => {
      const g = room(); if (!g) return { ok: false };
      const r = G.removeSeat(g.st, u.id, p.pid);
      if (r.ok) { if (r.removedUser) { this.userRoom.delete(r.removedUser); const s = this.sockFor(g, r.removedUser); if (s) { g.sockets.delete(s); s.emit('state', null); s.emit('toast', { type: 'warn', text: 'You were removed from the room by the host.' }); } } this.changed(g); }
      return r;
    });
    h('room:settings', p => { const g = room(); if (!g) return { ok: false }; const r = G.setSettings(g.st, u.id, p); if (r.ok) this.changed(g); return r; });
    h('room:start', () => {
      const g = room(); if (!g) return { ok: false, error: 'No room.' };
      const r = G.start(g.st, u.id); if (!r.ok) return r;
      db.run("UPDATE games SET started_at=CURRENT_TIMESTAMP, status='playing' WHERE id=?", [g.dbId]);
      for (const s of g.st.seats) db.run('INSERT OR REPLACE INTO game_players (game_id, seat_key, user_id, is_bot, display_name) VALUES (?,?,?,?,?)', [g.dbId, s.pid, s.userId, s.bot ? 1 : 0, s.name]);
      if (g.st.phase === 'finished') this.onFinished(g); else { this.persist(g); this.emit(g, true); }
      return { ok: true };
    });
    h('game:action', p => {
      const g = room(); if (!g) return { ok: false, error: 'No game.' };
      const st = g.st; const seat = st.seats.find(s => s.userId === u.id);
      const r = G.act(st, u.id, p);
      if (st.phase === 'playing' || st.phase === 'finished') {
        db.run('INSERT INTO action_log (game_id, round, party_id, user_id, type, payload, ok) VALUES (?,?,?,?,?,?,?)', [g.dbId, st.round, seat?.pid || null, u.id, String(p.type).slice(0, 20), JSON.stringify(p).slice(0, 400), r.ok ? 1 : 0]);
      }
      if (r.ok) {
        if (r.notify) { const t = st.seats.find(s => s.pid === r.notify); const sock = t && t.userId && this.sockFor(g, t.userId); if (sock) sock.emit('toast', { type: 'info', text: `${seat.short} proposes an alliance - see the Allies tab.` }); }
        if (r.intelChanged) g.intel.add(u.id);
        if (r.resolved) { if (st.phase === 'finished') this.onFinished(g); else { this.persist(g); this.emit(g, true); this.io.to(st.code).emit('round', { round: st.round }); } }
        else { this.changedSoft(g); }
      }
      return { ok: r.ok, error: r.error, msg: r.msg };
    }, { action: true });
    h('chat:send', p => {
      const g = room(); if (!g) return { ok: false };
      if (!this.chatLimit('c' + u.id)) return { ok: false, error: 'You are sending messages too fast.' };
      const text = String(p.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, C.LIMIT.chatLen); if (!text) return { ok: false };
      const seat = g.st.seats.find(s => s.userId === u.id);
      const msg = { name: u.display_name, pid: seat?.pid, text, t: Date.now() };
      db.run('INSERT INTO chat_messages (game_id, user_id, display_name, text) VALUES (?,?,?,?)', [g.dbId, u.id, u.display_name, text]);
      this.io.to(g.st.code).emit('chat', msg); return { ok: true };
    });
    socket.on('disconnect', () => {
      const g = room(); if (!g) return;
      g.sockets.delete(socket);
      const seat = g.st.seats.find(s => s.userId === u.id);
      if (seat && !this.sockFor(g, u.id)) { seat.connected = false; if (g.st.phase === 'lobby') { seat.ready = false; } this.changedSoft(g); }
    });
  }
  attach(socket, g, quiet) {
    const u = socket.user;
    socket.join(g.st.code); g.sockets.add(socket);
    const seat = g.st.seats.find(s => s.userId === u.id); if (seat) { seat.connected = true; seat.discAt = null; }
    socket.emit('state', view(g.st, u.id, true));
    if (!quiet) this.emit(g);
    else this.emit(g);
  }
  leaveRoom(socket) {
    const u = socket.user; const code = this.userRoom.get(u.id); const g = code && this.games.get(code); if (!g) return;
    const r = G.leave(g.st, u.id);
    this.userRoom.delete(u.id); g.sockets.delete(socket); socket.leave(code); socket.emit('state', null);
    if (g.st.phase === 'finished') { this.maybeDrop(g); return; }
    if (r.closed) { this.dropGame(g, g.st.phase === 'playing' ? 'abandoned' : 'abandoned'); return; }
    this.changed(g);
  }
  maybeDrop(g) { if (![...g.st.seats].some(s => s.userId && this.userRoom.get(s.userId) === g.st.code)) this.games.delete(g.st.code); }
  dropGame(g, status) {
    for (const s of g.st.seats) if (s.userId) this.userRoom.delete(s.userId);
    for (const sock of g.sockets) { sock.leave(g.st.code); sock.emit('state', null); }
    this.games.delete(g.st.code);
    db.run('UPDATE games SET status=?, state_json=NULL WHERE id=?', [status, g.dbId]);
  }
  broadcastToast(g, text) { this.io.to(g.st.code).emit('toast', { type: 'info', text }); }
  changed(g) { this.persist(g); this.emit(g); }
  changedSoft(g) { // debounce persistence of mid-round actions
    if (Date.now() - g.saved > 4000) this.persist(g);
    this.emit(g);
  }
  tickAll() {
    const now = Date.now();
    for (const g of this.games.values()) {
      try {
        const st = g.st;
        if (st.phase === 'playing') {
          if (G.tick(st, now)) {
            if (st.phase === 'finished') this.onFinished(g); else { this.persist(g); this.emit(g, true); this.io.to(st.code).emit('round', { round: st.round }); }
          } else if (st.deadline) { /* clients show countdown from deadline */ }
          // abandon game if every human has been gone 10 min
          const hs = G.humans(st);
          if (hs.length && hs.every(s => !s.connected && now - (s.discAt || now) > 600000)) this.dropGame(g, 'abandoned');
        } else if (st.phase === 'lobby' && !g.sockets.size && now - g.saved > 30 * 60000) {
          this.dropGame(g, 'abandoned');
        } else if (st.phase === 'finished' && !g.sockets.size && now - g.saved > 10 * 60000) {
          this.games.delete(st.code);
        }
      } catch (e) { console.error('[tick]', e); }
    }
  }
  onFinished(g) {
    const st = g.st; const res = st.results;
    try {
      db.tx(() => {
        db.run("UPDATE games SET status='finished', finished_at=CURRENT_TIMESTAMP, ranked=?, rounds_played=?, state_json=NULL WHERE id=?", [st.ranked ? 1 : 0, st.totalRounds, g.dbId]);
        const pts = G.rankedPoints(st); const cap = cfg.RANKED_GAMES_PER_DAY;
        for (const p of res.parties) {
          const seat = st.seats.find(s => s.pid === p.pid);
          const rp = pts.find(x => x.pid === p.pid);
          let points = 0;
          if (rp) {
            const stt = db.get('SELECT * FROM user_stats WHERE user_id=?', [rp.userId]) || { ranked_today: 0, last_ranked_day: null };
            const todayCount = stt.last_ranked_day === today() ? stt.ranked_today : 0;
            if (todayCount < cap) {
              points = rp.points;
              db.run(`INSERT INTO user_stats (user_id, ranked_games, wins, total_seats, best_seats, points, last_ranked_day, ranked_today) VALUES (?,?,?,?,?,?,?,1)
                ON CONFLICT(user_id) DO UPDATE SET ranked_games=ranked_games+1, wins=wins+?, total_seats=total_seats+?, best_seats=MAX(best_seats,?), points=points+?, last_ranked_day=?, ranked_today=?`,
                [rp.userId, 1, rp.won ? 1 : 0, rp.seats, rp.seats, points, today(), rp.won ? 1 : 0, rp.seats, rp.seats, points, today(), todayCount + 1]);
            }
          }
          db.run('INSERT OR REPLACE INTO game_results (game_id, party_id, user_id, display_name, seats, vote_share, rank, is_pm, in_government, points) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [g.dbId, p.pid, seat.userId, seat.name, p.seats, p.voteShare, p.rank, p.pm ? 1 : 0, p.inGov ? 1 : 0, points]);
        }
        for (const c of res.per) db.run('INSERT OR REPLACE INTO constituency_results VALUES (?,?,?,?,?,?,?)', [g.dbId, c.id, c.w, c.r, c.m, c.t, JSON.stringify(c.sh)]);
      });
    } catch (e) { console.error('[onFinished]', e); }
    // keep sockets attached so they can watch the results; room is dropped when they leave
    for (const s of st.seats) if (s.userId) this.userRoom.set(s.userId, st.code);
    this.emit(g, true);
    this.io.to(st.code).emit('election', { code: st.code });
  }
  shutdown() { for (const g of this.games.values()) if (g.st.phase !== 'finished') try { this.persist(g); } catch {} db.close(); }
}
module.exports = { Rooms };
