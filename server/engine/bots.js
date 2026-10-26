'use strict';
// Simple AI that plays through the exact same validated action API as humans.
const A = require('./actions');
const C = require('./constants');
const model = require('./model');
const cons = require('../data/constituencies');
const { GROUPS, ISSUES } = require('../data/issues');
const { Rng } = require('../util/rng');

function projectedSeats(state) { return model.projection(state).seats; }

function tuneManifesto(state, seat, rng, level) {
  // hill-climb manifesto against current projection (hard) or nudge randomly (easy/normal)
  const steps = level === 'hard' ? 2 : level === 'normal' ? 1 : 0;
  const idx = state.seats.indexOf(seat);
  for (let n = 0; n < steps; n++) {
    let best = null; const base = projectedSeats(state)[idx];
    for (const is of ISSUES) for (const d of [-1, 1]) {
      const old = seat.manifesto[is.id]; const v = old + d; if (v < -2 || v > 2) continue;
      seat.manifesto[is.id] = v; const sc = projectedSeats(state)[idx]; seat.manifesto[is.id] = old;
      if (sc > base + 1 && (!best || sc > best.sc)) best = { is, v, sc };
    }
    if (best) A.apply(state, seat.pid, { type: 'policy', issue: best.is.id, stance: best.v });
  }
}
function budgetMove(state, seat) {
  const b = state.budget, e = state.economy, B = C.BUDGET_LIMITS;
  const idxOf = C.BUDGET_SECTOR_INDEX;
  const keys = Object.keys(C.BASE_BUDGET).sort((x, y) => e[idxOf[x]] - e[idxOf[y]]);
  const nb = { ...b }; const lo = keys[0], hi = keys[keys.length - 1];
  const d = Math.min(4, nb[hi] - B.sectorMin, B.sectorMax - nb[lo]);
  nb[lo] += d; nb[hi] -= d;
  nb.tax = Math.min(B.taxMax, Math.max(B.taxMin, b.tax + (e.infl > 7 ? 1 : e.gdp < 5 ? -1 : 0)));
  nb.deficit = Math.min(B.defMax, Math.max(B.defMin, b.deficit + (e.debt > 85 ? -0.5 : 0)));
  A.apply(state, seat.pid, { type: 'budget', ...nb });
}
function turn(state, seat, level = 'normal') {
  seat.driving = true;
  try { play(state, seat, level); } finally { delete seat.driving; }
}
function play(state, seat, level) {
  const rng = new Rng(state);
  const noise = level === 'easy' ? 0.5 : level === 'normal' ? 0.2 : 0;
  if (state.round === 1 || (level === 'hard' && state.round % 4 === 0)) tuneManifesto(state, seat, rng, level);
  if (state.incumbent === seat.pid) budgetMove(state, seat);
  // proposals
  const myRank = (() => { const s = projectedSeats(state); const i = state.seats.indexOf(seat); return s.filter(v => v > s[i]).length; })();
  for (const p of state.proposals.filter(p => p.to === seat.pid)) A.apply(state, seat.pid, { type: 'respond', from: p.from, accept: myRank > 0 && rng.next() < 0.6 });
  if (level !== 'easy' && myRank > 0 && state.round >= 2 && !A.allianceOf(state, seat.pid) && rng.next() < 0.25) {
    const cand = state.seats.filter(s => s.pid !== seat.pid && !A.allianceOf(state, s.pid));
    if (cand.length) A.apply(state, seat.pid, { type: 'propose', target: rng.pick(cand).pid });
  }
  if (seat.energy < 30) A.apply(state, seat.pid, { type: 'rest' });
  while (seat.funds < 14 && seat.round.fundraise < 2 && seat.controversy < 0.6 && seat.ap > 0) A.apply(state, seat.pid, { type: 'fundraise' });
  // find marginal seats
  const P = model.prep(state); const idx = state.seats.indexOf(seat);
  const cands = [];
  for (const c of cons.get().list) {
    const sc = model.scores(state, P, c).map(v => v + rng.normal() * noise);
    const [w, r] = model.top2(sc);
    const margin = w === idx ? sc[idx] - sc[r] : sc[w] - sc[idx];
    const value = (w === idx ? (margin < 0.35 ? 1 : 0.2) : (margin < 0.6 ? 1 : 0)) * (0.5 + c.electorate / 3);
    if (value > 0) cands.push({ c, value: value * (1 - 0.3 * Math.min(1, margin)) });
  }
  cands.sort((a, b) => b.value - a.value);
  let guard = 0, k = 0;
  while (seat.ap > 1 && guard++ < 20 && cands.length) {
    const t = cands[k++ % Math.min(cands.length, 8)].c;
    let r = A.apply(state, seat.pid, { type: (guard % 3 === 0 || seat.energy < 20) ? 'booth' : 'rally', cid: t.id });
    if (!r.ok && /exhausted/.test(r.error)) r = A.apply(state, seat.pid, { type: 'rest' });
    if (!r.ok && /funds/.test(r.error)) break;
  }
  if (seat.ap > 0 && seat.funds >= 10 && cands.length) {
    const sid = cands[0].c.sid; const gsum = GROUPS.map((g, i) => cons.get().byState[sid].reduce((a, c) => a + c.g[i], 0));
    const gi = gsum.indexOf(Math.max(...gsum));
    A.apply(state, seat.pid, { type: 'ad', sid, group: GROUPS[gi].id });
  }
  if (level === 'hard' && seat.ap > 0 && seat.funds >= 12 && state.round >= 3 && myRank > 0) {
    const s = projectedSeats(state); const order = state.seats.map((x, i) => [x, s[i]]).sort((a, b) => b[1] - a[1]);
    const tgt = order.find(([x]) => x.pid !== seat.pid && !A.allianceOf(state, seat.pid)?.members.includes(x.pid));
    if (tgt) A.apply(state, seat.pid, { type: 'attack', target: tgt[0].pid });
  }
}
module.exports = { turn };
