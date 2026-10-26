'use strict';
// End-to-end: real HTTP + Socket.IO server, two human clients and an AI party.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os'), path = require('path'), fs = require('fs');
const tmp = path.join(os.tmpdir(), 'bpp-test-' + process.pid + '.sqlite');
process.env.DB_FILE = tmp; process.env.PORT = '0'; process.env.JWT_SECRET = 'test-secret';
const { io: ioc } = require('socket.io-client');

let ctx, base;
test.before(async () => {
  const cfg = require('../server/config'); cfg.PORT = 0;
  ctx = await require('../server/index').main();
  await new Promise(r => ctx.server.listening ? r() : ctx.server.once('listening', r));
  base = 'http://localhost:' + ctx.server.address().port;
});
test.after(() => { ctx.rooms.shutdown(); ctx.io.close(); ctx.server.close(); try { fs.unlinkSync(tmp); } catch {} setTimeout(() => process.exit(0), 100).unref(); });

const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async r => ({ status: r.status, ...(await r.json()) }));
function client(token) {
  const s = ioc(base, { auth: { token }, transports: ['websocket'] });
  s.view = null; s.on('state', v => { s.view = v; });
  s.call = (ev, p) => new Promise(res => s.emit(ev, p, res));
  return new Promise((res, rej) => { s.on('connect', () => res(s)); s.on('connect_error', rej); });
}
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 20)); } throw new Error('timeout waiting'); };

test('auth validation', async () => {
  assert.strictEqual((await post('/api/auth/register', { username: 'x', password: 'password1' })).status, 400);
  assert.strictEqual((await post('/api/auth/register', { username: 'okname', password: 'short' })).status, 400);
  const r = await post('/api/auth/register', { username: 'dupe_user', password: 'password123' }); assert.strictEqual(r.status, 200); assert.ok(r.token);
  assert.strictEqual((await post('/api/auth/register', { username: 'DUPE_user', password: 'password123' })).status, 400);
  assert.strictEqual((await post('/api/auth/login', { username: 'dupe_user', password: 'wrongpass1' })).status, 401);
  assert.strictEqual((await post('/api/auth/login', { username: 'dupe_user', password: 'password123' })).status, 200);
  const bad = await fetch(base + '/api/auth/me', { headers: { authorization: 'Bearer nonsense' } }); assert.strictEqual(bad.status, 401);
});
test('map & meta endpoints', async () => {
  const m = await (await fetch(base + '/api/map')).json(); assert.strictEqual(m.constituencies.length, 543); assert.strictEqual(m.states.length, 36);
  const meta = await (await fetch(base + '/api/meta')).json(); assert.strictEqual(meta.parties.length, 7); assert.strictEqual(meta.majority, 272);
  assert.strictEqual((await fetch(base + '/api/geo')).status, 404);
  assert.ok((await fetch(base + '/')).ok);
});
test('socket rejects unauthenticated connections', async () => { await assert.rejects(() => client('bad-token')); });

test('multiplayer game: lobby -> rounds -> election -> leaderboard', async () => {
  const a = (await post('/api/auth/register', { username: 'alice_t', password: 'password123', displayName: 'Alice' }));
  const b = (await post('/api/auth/register', { username: 'bob_t', password: 'password123', displayName: 'Bob' }));
  const sa = await client(a.token), sb = await client(b.token);
  const c = await sa.call('room:create', { settings: { rounds: 6, timer: 0, maxPlayers: 4 } }); assert.ok(c.ok, JSON.stringify(c));
  assert.match(c.code, /^[A-Z2-9]{5}$/);
  assert.ok(!(await sa.call('room:create', {})).ok, 'cannot create second room');
  assert.ok(!(await sb.call('room:join', { code: 'NOPE1' })).ok);
  assert.ok((await sb.call('room:join', { code: c.code.toLowerCase() })).ok);
  await until(() => sa.view?.seats?.length === 2);
  assert.ok(!(await sb.call('room:addBot', { level: 'normal' })).ok, 'only host adds bots');
  assert.ok(!(await sb.call('room:start')).ok, 'only host starts');
  assert.ok(!(await sa.call('room:start')).ok, 'not everyone ready');
  const taken = sa.view.seats.find(s => s.you).pid;
  assert.ok(!(await sb.call('room:party', { pid: taken })).ok, 'party already taken');
  assert.ok((await sa.call('room:addBot', { level: 'hard' })).ok);
  assert.ok((await sb.call('room:ready', { ready: true })).ok);
  assert.ok((await sa.call('room:start')).ok);
  await until(() => sa.view?.phase === 'playing' && sb.view?.phase === 'playing');
  assert.ok(sa.view.intel && Object.keys(sa.view.intel).length === 543, 'player receives only own intel');
  assert.ok(!sa.view.parties.some(p => 'funds' in p || 'ap' in p), 'other parties private data is hidden');
  assert.ok(sa.view.me.funds > 0);
  for (let round = 1; round <= 6; round++) {
    await until(() => sa.view.round === round && sb.view.round === round);
    for (const [s, off] of [[sa, 0], [sb, 3]]) {
      const r = await s.call('game:action', { type: 'rally', cid: `UP-${String(1 + off + round).padStart(2, '0')}` }); assert.ok(r.ok, r.error);
      assert.ok((await s.call('game:action', { type: 'booth', cid: `MH-${String(round + 1).padStart(2, '0')}` })).ok);
      assert.ok(!(await s.call('game:action', { type: 'policy', issue: 'tax', stance: 7 })).ok);
      assert.ok(!(await s.call('game:action', { type: 'budget', health: 1 })).ok);
    }
    if (round === 2) { const p = await sa.call('game:action', { type: 'poll', sid: 'UP' }); assert.ok(p.ok, p.error); }
    assert.ok((await sa.call('game:action', { type: 'endTurn' })).ok);
    assert.ok(!(await sa.call('game:action', { type: 'rest' })).ok, 'no actions after ending turn');
    if (round < 6) assert.strictEqual(sb.view.round, round, 'round waits for all humans');
    assert.ok((await sb.call('game:action', { type: 'endTurn' })).ok);
  }
  await until(() => sa.view.phase === 'finished' && sb.view.phase === 'finished');
  const res = sa.view.results; assert.strictEqual(res.parties.reduce((x, p) => x + p.seats, 0), 543);
  assert.deepStrictEqual(JSON.stringify(sa.view.results), JSON.stringify(sb.view.results), 'both players see identical results');
  const lb = await (await fetch(base + '/api/leaderboard')).json();
  assert.ok(lb.rows.length >= 1, 'ranked 2-human game appears on leaderboard'); assert.ok(lb.rows.every(r => r.points > 0 || r.games > 0));
  const hist = await (await fetch(base + '/api/history', { headers: { authorization: 'Bearer ' + a.token } })).json(); assert.strictEqual(hist.rows.length, 1);
  const require_db = require('../server/db');
  assert.strictEqual(require_db.get('SELECT COUNT(*) n FROM constituency_results').n, 543);
  assert.ok(require_db.get('SELECT COUNT(*) n FROM action_log').n > 10);
  assert.ok((await sa.call('room:leave')).ok); assert.ok((await sb.call('room:leave')).ok);
  assert.ok((await sa.call('room:create', { settings: {} })).ok, 'can host again after leaving');
  sa.close(); sb.close();
});
