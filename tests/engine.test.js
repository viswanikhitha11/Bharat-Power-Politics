'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../server/engine/game');
const A = require('../server/engine/actions');
const cons = require('../server/data/constituencies');
const STATES = require('../server/data/states');
const PARTIES = require('../server/data/parties');

function mk(n = 3, rounds = 6) {
  const st = G.create({ code: 'T' + Math.random(), hostId: 1, hostName: 'a', settings: { rounds, timer: 0 } });
  st.seats = [];
  for (let i = 0; i < n; i++) st.seats.push({ pid: PARTIES[i].id, userId: i + 1, name: 'p' + i, bot: null, ready: true, connected: true });
  assert.ok(G.start(st, 1).ok);
  return st;
}
test('data: 543 seats, 36 states/UTs, majority 272', () => {
  assert.strictEqual(STATES.reduce((a, s) => a + s.seats, 0), 543);
  assert.strictEqual(STATES.length, 36);
  const { list } = cons.get(); assert.strictEqual(list.length, 543);
  assert.strictEqual(new Set(list.map(c => `${c.x},${c.y}`)).size, 543, 'map cells must not overlap');
  assert.strictEqual(new Set(list.map(c => c.id)).size, 543);
  for (const c of list) assert.ok(Math.abs(c.g.reduce((a, v) => a + v, 0) - 1) < 0.01);
});
test('rally: spends resources, diminishing returns, per-seat limits', () => {
  const st = mk(); const me = st.seats[0]; const cid = 'UP-05';
  const f0 = me.funds;
  assert.ok(G.act(st, 1, { type: 'rally', cid }).ok);
  assert.strictEqual(me.funds, f0 - 8); assert.strictEqual(me.ap, 5);
  const m1 = st.local[cid][me.pid].mom;
  assert.ok(G.act(st, 1, { type: 'rally', cid }).ok);
  const m2 = st.local[cid][me.pid].mom - m1; assert.ok(m2 < m1, 'second rally yields less');
  const r = G.act(st, 1, { type: 'rally', cid }); assert.ok(!r.ok, 'third rally in same seat blocked');
});
test('anti-exploit: invalid / malicious payloads are rejected and change nothing', () => {
  const st = mk(); const me = st.seats[0]; const snap = JSON.stringify(me);
  for (const bad of [
    { type: 'rally', cid: 'XX-99' }, { type: 'rally' }, { type: 'ad', sid: 'UP', group: 'hackers' }, { type: 'policy', issue: 'tax', stance: 99 },
    { type: 'policy', issue: 'tax', stance: 1.5 }, { type: 'policy', issue: '__proto__', stance: 1 }, { type: 'budget', health: 5 }, { type: 'nope' },
    { type: 'attack', target: me.pid }, { type: 'propose', target: 'ZZZ' }, null, 'rally', { type: 'constructor' }, { type: 'hasOwnProperty' },
  ]) assert.ok(!G.act(st, 1, bad).ok, JSON.stringify(bad));
  assert.strictEqual(JSON.stringify(me), snap);
  assert.ok(!G.act(st, 99, { type: 'rally', cid: 'UP-01' }).ok, 'non-seated user');
});
test('cannot exceed action points, funds or per-seat spending cap', () => {
  const st = mk(); const me = st.seats[0]; me.funds = 1000;
  let n = 0; for (let i = 0; i < 20; i++) if (G.act(st, 1, { type: 'booth', cid: `UP-0${1 + (i % 9)}` }).ok) n++;
  assert.strictEqual(n, 6, 'only 6 AP per round'); assert.strictEqual(me.ap, 0);
  const st2 = mk(); const m2 = st2.seats[0]; m2.funds = 1000; m2.ap = 99; let ok = 0;
  for (let i = 0; i < 30; i++) { m2.energy = 100; if (G.act(st2, 1, { type: 'booth', cid: 'BR-01' }).ok) ok++; }
  assert.ok(ok * 5 <= 60, 'spending cap per constituency');
});
test('budget: only incumbent, bounded step, must sum to 100', () => {
  const st = mk(); const inc = st.seats.find(s => s.pid === st.incumbent); const other = st.seats.find(s => s.pid !== st.incumbent);
  const b = { ...st.budget }; const newB = { ...b, health: b.health + 4, infra: b.infra - 4 };
  assert.ok(!G.act(st, other.userId, { type: 'budget', ...newB }).ok);
  assert.ok(!G.act(st, inc.userId, { type: 'budget', ...newB, tax: 40 }).ok, 'tax step too large');
  assert.ok(!G.act(st, inc.userId, { type: 'budget', ...newB, health: b.health + 20, infra: b.infra - 20 }).ok, 'sector step too large');
  assert.ok(!G.act(st, inc.userId, { type: 'budget', ...b, health: b.health + 2 }).ok, 'sum != 100');
  assert.ok(G.act(st, inc.userId, { type: 'budget', ...newB }).ok);
  assert.ok(!G.act(st, inc.userId, { type: 'budget', ...newB }).ok, 'once per round');
});
test('turn lifecycle: resolves only when every player ended turn; no actions after endTurn', () => {
  const st = mk(2); assert.strictEqual(st.round, 1);
  assert.ok(G.act(st, 1, { type: 'endTurn' }).ok); assert.strictEqual(st.round, 1);
  assert.ok(!G.act(st, 1, { type: 'rest' }).ok, 'cannot act after ending turn');
  const r = G.act(st, 2, { type: 'endTurn' }); assert.ok(r.resolved); assert.strictEqual(st.round, 2);
  assert.strictEqual(st.seats[0].ap, 6); assert.strictEqual(st.seats[0].ready, false);
});
test('timer forces turn end, repeated absence -> autopilot', () => {
  const st = mk(2); st.deadline = Date.now() - 1;
  assert.ok(G.tick(st, Date.now())); assert.strictEqual(st.round, 2);
  st.deadline = Date.now() - 1; G.tick(st, Date.now());
  assert.ok(st.seats.every(s => s.autopilot), 'two missed rounds => autopilot');
});
test('alliances: propose/accept/lock and no self-attacks', () => {
  const st = mk(3, 8);
  assert.ok(G.act(st, 1, { type: 'propose', target: st.seats[1].pid }).ok);
  assert.ok(!G.act(st, 3, { type: 'respond', from: st.seats[0].pid, accept: true }).ok, 'only the target can respond');
  assert.ok(G.act(st, 2, { type: 'respond', from: st.seats[0].pid, accept: true }).ok);
  assert.strictEqual(st.alliances.length, 1);
  assert.ok(!G.act(st, 1, { type: 'attack', target: st.seats[1].pid }).ok, 'cannot attack ally');
});
test('full game finishes with 543 seats and valid government', () => {
  const st = mk(4, 5); let guard = 0;
  while (st.phase === 'playing' && guard++ < 50) for (const s of st.seats) G.act(st, s.userId, { type: 'endTurn' });
  assert.strictEqual(st.phase, 'finished');
  const r = st.results; assert.strictEqual(r.parties.reduce((a, p) => a + p.seats, 0), 543); assert.strictEqual(r.per.length, 543);
  assert.ok(['majority', 'hung'].includes(r.gov.type)); assert.strictEqual(r.parties[0].pid, r.gov.pm);
  if (r.gov.type === 'majority') assert.ok(r.gov.seats >= 272);
});
test('ranked points need >=2 humans (AI-only farming gives nothing)', () => {
  const st = mk(3, 6); st.seats[1].bot = 'normal'; st.seats[1].userId = null; st.seats[2].bot = 'normal'; st.seats[2].userId = null; st.ranked = false;
  let guard = 0; while (st.phase === 'playing' && guard++ < 50) for (const s of st.seats) if (s.userId) G.act(st, s.userId, { type: 'endTurn' });
  assert.deepStrictEqual(G.rankedPoints(st), []);
});
