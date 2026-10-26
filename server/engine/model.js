'use strict';
// Voting model: turns campaign state into vote shares for every constituency.
const C = require('./constants');
const { GROUPS, ISSUES, PREF, WEIGHT } = require('../data/issues');
const cons = require('../data/constituencies');
const { clamp } = require('../util/rng');

function alignment(m, k) {
  let num = 0, den = 0;
  ISSUES.forEach((is, i) => { const w = WEIGHT[k][i]; num += w * Math.abs((m[is.id] ?? 0) - PREF[k][i]); den += w; });
  return 1 - num / (den * 4);
}
function manifestoCost(m) {
  let c = 0;
  for (const is of ISSUES) { const s = m[is.id] || 0; c += is.id === 'tax' ? Math.max(0, -s) : Math.max(0, s); }
  return c;
}
// Over-promising hurts credibility: a manifesto costing > 6 "fiscal points" is discounted.
function credibilityMult(seat) {
  const pen = Math.max(0.6, 1 - 0.06 * Math.max(0, manifestoCost(seat.manifesto) - 6));
  return pen * (0.7 + 0.3 * seat.credibility);
}
// Neutralisation: each party's *default* manifesto/appeal is scored against the national average so that
// balance comes from regional strength + campaigning, while manifesto *changes* still matter (relative to default).
const PARTIES = require('../data/parties');
let neutralCache = null;
function neutral() {
  if (neutralCache) return neutralCache;
  const list = cons.get().list; neutralCache = {};
  for (const p of PARTIES) {
    const man = Object.fromEntries(ISSUES.map((is, i) => [is.id, p.stance[i]]));
    const al = GROUPS.map((g, k) => alignment(man, k));
    let pol = 0, app = 0;
    for (const c of list) for (let k = 0; k < GROUPS.length; k++) { pol += c.g[k] * al[k]; app += c.g[k] * (p.appeal[k] - 0.5); }
    neutralCache[p.id] = { policy: pol / list.length, appeal: app / list.length };
  }
  return neutralCache;
}
function prep(state) {
  const seats = state.seats; const N = neutral();
  const align = seats.map(p => GROUPS.map((g, k) => alignment(p.manifesto, k) * credibilityMult(p)));
  const allyOf = seats.map(() => -1);
  state.alliances.forEach((al, ai) => al.members.forEach(pid => { const i = seats.findIndex(s => s.pid === pid); if (i >= 0) allyOf[i] = ai; }));
  const incIdx = seats.findIndex(s => s.pid === state.incumbent);
  const gapp = GROUPS.map(g => ((state.approval?.groups?.[g.id] ?? 50) - 50) / 50);
  return { seats, align, allyOf, incIdx, gapp, off: seats.map(p => N[p.pid]) };
}
// raw (pre-noise) score of every party in constituency c
function scores(state, P, c) {
  const out = new Array(P.seats.length);
  const ads = state.ads[c.sid];
  const loc = state.local[c.id];
  for (let i = 0; i < P.seats.length; i++) {
    const p = P.seats[i];
    let policy = 0, appeal = 0, ad = 0, inc = 0;
    const adp = ads && ads[p.pid];
    for (let k = 0; k < GROUPS.length; k++) {
      const g = c.g[k];
      policy += g * P.align[i][k];
      appeal += g * (p.appeal[k] - 0.5);
      if (adp) ad += g * (adp[GROUPS[k].id] || 0);
      if (i === P.incIdx) inc += g * P.gapp[k];
    }
    const l = loc && loc[p.pid];
    policy -= P.off[i].policy; appeal -= P.off[i].appeal;
    let s = 1.5 * c.base[p.pid] + 2.6 * policy + 1.4 * appeal + 1.1 * p.popularity + 1.2 * ad
      + (l ? 1.1 * l.org + 1.5 * Math.min(l.mom, 1.5) : 0);
    if (i === P.incIdx) s += -0.25 + 1.6 * inc + (state.mood[c.sid] || 0);
    out[i] = s;
  }
  return out;
}
function softmax(sc, others) {
  let m = -Infinity; for (const v of sc) if (v > m) m = v;
  let z = 0; const e = sc.map(v => { const x = Math.exp(v - m); z += x; return x; });
  return e.map(x => x / z * (1 - others));
}
// Alliance vote transfer: weaker allies' votes partly flow to the strongest ally in the seat.
function allianceAdjust(P, sh) {
  const adj = sh.slice();
  const groups = {};
  P.allyOf.forEach((a, i) => { if (a >= 0) (groups[a] = groups[a] || []).push(i); });
  for (const idxs of Object.values(groups)) {
    if (idxs.length < 2) continue;
    let b = idxs[0]; for (const i of idxs) if (sh[i] > sh[b]) b = i;
    for (const i of idxs) if (i !== b) { const mv = 0.6 * sh[i]; adj[b] += mv; adj[i] -= mv; }
  }
  return adj;
}
function top2(arr) {
  let a = -1, b = -1;
  for (let i = 0; i < arr.length; i++) { if (a < 0 || arr[i] > arr[a]) { b = a; a = i; } else if (b < 0 || arr[i] > arr[b]) b = i; }
  return [a, b];
}
// Noise-free projection of national vote and seats (used for income, tracking polls)
function projection(state) {
  const P = prep(state);
  const votes = new Array(P.seats.length).fill(0); const seatsWon = new Array(P.seats.length).fill(0); let tv = 0;
  for (const c of cons.get().list) {
    const sh = softmax(scores(state, P, c), c.others);
    const adj = allianceAdjust(P, sh);
    const [w] = top2(adj); seatsWon[w]++;
    const v = c.electorate * c.turnout; tv += v; sh.forEach((x, i) => votes[i] += x * v);
  }
  return { votes: votes.map(v => v / tv), seats: seatsWon };
}
// Noisy intel for a player: rough (free, every round) or precise (commissioned poll)
function intelFor(state, P, c, rng, sigma) {
  const sc = scores(state, P, c).map(v => v + rng.normal() * sigma);
  return softmax(sc, c.others).map(x => Math.round(x * 1000) / 1000);
}
function runElection(state, rng) {
  const P = prep(state); const { list } = cons.get();
  const swing = P.seats.map(() => rng.normal() * 0.10); // late national swing per party
  const per = [];
  const votes = P.seats.map(() => 0); const seatsWon = P.seats.map(() => 0); let tv = 0;
  const stateSeats = {};
  for (const c of list) {
    const sc = scores(state, P, c).map((v, i) => v + swing[i] + rng.normal() * c.sigma);
    const sh = softmax(sc, c.others);
    const adj = allianceAdjust(P, sh);
    const [w, r] = top2(adj);
    const turnout = clamp(c.turnout + rng.normal() * 0.02, 0.4, 0.85);
    const v = c.electorate * turnout; tv += v; sh.forEach((x, i) => votes[i] += x * v);
    seatsWon[w]++;
    (stateSeats[c.sid] = stateSeats[c.sid] || P.seats.map(() => 0))[w]++;
    per.push({ id: c.id, w: P.seats[w].pid, r: P.seats[r].pid, sh: sh.map(x => Math.round(x * 1000) / 1000), m: Math.round((adj[w] - adj[r]) * 1000) / 1000, t: Math.round(turnout * 1000) / 1000 });
  }
  return { P, per, seatsWon, votes: votes.map(v => v / tv), stateSeats, totalVotesLakh: tv };
}
module.exports = { alignment, manifestoCost, credibilityMult, prep, scores, softmax, allianceAdjust, projection, intelFor, runElection, top2 };
