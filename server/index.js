'use strict';
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cfg = require('./config');
const db = require('./db');
const auth = require('./auth');
const { expressLimiter } = require('./util/ratelimit');
const cons = require('./data/constituencies');
const PARTIES = require('./data/parties');
const { ISSUES, GROUPS, PREF, WEIGHT } = require('./data/issues');
const C = require('./engine/constants');
const fs = require('fs');

async function main() {
  await db.open();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '20kb' }));

  const authLimiter = expressLimiter(15, 60000);
  app.post('/api/auth/register', authLimiter, (req, res) => { const r = auth.register(req.body?.username, req.body?.password, req.body?.displayName); res.status(r.error ? 400 : 200).json(r); });
  app.post('/api/auth/login', authLimiter, (req, res) => { const r = auth.login(req.body?.username, req.body?.password); res.status(r.error ? 401 : 200).json(r); });
  app.get('/api/auth/me', auth.middleware, (req, res) => res.json({ user: auth.publicUser(req.user) }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  const meta = {
    parties: PARTIES.map(p => ({ id: p.id, name: p.name, short: p.short, color: p.color, symbol: p.symbol, slogan: p.slogan, leader: p.leader, appeal: p.appeal, stance: p.stance, home: Object.entries(p.strength).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]) })),
    issues: ISSUES, groups: GROUPS, pref: PREF, weight: WEIGHT, majority: C.MAJORITY, supermajority: C.SUPERMAJORITY, total: C.SEATS_TOTAL, cost: C.COST, limit: C.LIMIT, baseBudget: C.BASE_BUDGET, budgetLimits: C.BUDGET_LIMITS, timers: C.TIMERS, rounds: [C.ROUNDS_MIN, C.ROUNDS_MAX],
  };
  app.get('/api/meta', (req, res) => res.json(meta));
  const mapJson = JSON.stringify(cons.publicMap());
  app.get('/api/map', (req, res) => { res.type('json').set('Cache-Control', 'public, max-age=3600').send(mapJson); });
  // Optional real geographic map: drop an India states GeoJSON at data/india-states.geojson (see README)
  const geoFile = path.join(cfg.ROOT, 'data', 'india-states.geojson');
  app.get('/api/geo', (req, res) => fs.existsSync(geoFile) ? res.type('json').sendFile(geoFile) : res.status(404).json({ error: 'No GeoJSON installed.' }));

  app.get('/api/leaderboard', (req, res) => {
    const rows = db.all(`SELECT u.display_name AS name, s.points, s.ranked_games AS games, s.wins, s.best_seats AS bestSeats,
        CASE WHEN s.ranked_games>0 THEN ROUND(1.0*s.total_seats/s.ranked_games) ELSE 0 END AS avgSeats
      FROM user_stats s JOIN users u ON u.id=s.user_id WHERE s.ranked_games>0 ORDER BY s.points DESC, s.wins DESC LIMIT 50`);
    res.json({ rows });
  });
  app.get('/api/history', auth.middleware, (req, res) => {
    const rows = db.all(`SELECT g.code, g.finished_at AS finishedAt, g.ranked, r.party_id AS party, r.seats, r.rank, r.is_pm AS pm, r.points,
        (SELECT COUNT(*) FROM game_players p WHERE p.game_id=g.id AND p.is_bot=0) AS humans
      FROM game_results r JOIN games g ON g.id=r.game_id WHERE r.user_id=? ORDER BY g.id DESC LIMIT 20`, [req.user.id]);
    res.json({ rows });
  });
  app.get('/api/me/stats', auth.middleware, (req, res) => res.json({ stats: db.get('SELECT * FROM user_stats WHERE user_id=?', [req.user.id]) }));

  app.use(express.static(path.join(cfg.ROOT, 'public'), { extensions: ['html'], maxAge: '5m' }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: cfg.CORS_ORIGIN }, maxHttpBufferSize: 1e5, pingTimeout: 20000 });
  const { Rooms } = require('./rooms');
  const rooms = new Rooms(io);
  server.listen(cfg.PORT, () => console.log(`\n  Bharat-Power-Politics running at http://localhost:${cfg.PORT}\n`));
  const stop = () => { console.log('Saving and shutting down...'); rooms.shutdown(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  return { server, io, rooms, app };
}
if (require.main === module) main().catch(e => { console.error('Fatal:', e); process.exit(1); });
module.exports = { main };
