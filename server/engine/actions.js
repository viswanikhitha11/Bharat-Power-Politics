'use strict';
// Server-authoritative action handlers. Every input is validated; clients can only *request* actions.
const C = require('./constants');
const model = require('./model');
const { GROUPS, ISSUES } = require('../data/issues');
const STATES = require('../data/states');
const cons = require('../data/constituencies');
const { Rng, clamp } = require('../util/rng');

const err = error => ({ ok: false, error });
const ok = (msg, extra) => ({ ok: true, msg, ...(extra || {}) });
const seatOf = (state, pid) => state.seats.find(s => s.pid === pid);
const stateName = sid => STATES.find(s => s.id === sid).name;
const isStr = v => typeof v === 'string' && v.length < 40;

function news(state, type, text) {
  state.news.push({ r: state.round, t: type, x: text });
  if (state.news.length > 150) state.news.splice(0, state.news.length - 150);
}
function local(state, cid, pid) {
  const m = state.local[cid] || (state.local[cid] = {});
  return m[pid] || (m[pid] = { org: 0, mom: 0, spend: 0 });
}
function pay(seat, cost) {
  if ((cost.ap || 0) > seat.ap) return 'Not enough Action Points this round.';
  if ((cost.funds || 0) > seat.funds) return 'Not enough campaign funds.';
  if ((cost.energy || 0) > seat.energy) return 'Your leader is exhausted - use Rest.';
  seat.ap -= cost.ap || 0; seat.funds -= cost.funds || 0; seat.energy -= cost.energy || 0;
  seat.stats.spent += cost.funds || 0;
  return null;
}
function allianceOf(state, pid) { return state.alliances.find(a => a.members.includes(pid)); }
function lastRounds(state) { return state.round > state.totalRounds - C.LIMIT.allianceLockRounds; }

const H = {
  rally(state, seat, a) {
    const c = cons.get().byId[a.cid]; if (!isStr(a.cid) || !c) return err('Unknown constituency.');
    const cnt = seat.round.rallies[c.id] || 0;
    if (cnt >= C.LIMIT.rallyPerSeatPerRound) return err('Already held the maximum rallies here this round.');
    const loc = local(state, c.id, seat.pid);
    if (loc.spend + C.COST.rally.funds > C.LIMIT.seatSpendCap) return err('Election Commission spending cap reached in this constituency.');
    const energyBefore = seat.energy;
    const e = pay(seat, C.COST.rally); if (e) return err(e);
    const cf = 0.6 + 0.08 * seat.leader.charisma, ef = 0.5 + 0.5 * (energyBefore / C.ENERGY_MAX);
    const gain = 0.42 * cf * ef / (1 + 0.9 * loc.mom);
    loc.mom += gain; loc.spend += C.COST.rally.funds;
    for (const oc of cons.get().byState[c.sid]) if (oc.id !== c.id) local(state, oc.id, seat.pid).mom += gain * 0.12;
    seat.round.rallies[c.id] = cnt + 1; seat.stats.rallies++;
    state.roundLog.push({ pid: seat.pid, kind: 'rally', sid: c.sid });
    return ok(`Rally in ${c.n} (${stateName(c.sid)}) - momentum +${gain.toFixed(2)}`);
  },
  booth(state, seat, a) {
    const c = cons.get().byId[a.cid]; if (!isStr(a.cid) || !c) return err('Unknown constituency.');
    const loc = local(state, c.id, seat.pid);
    if (loc.spend + C.COST.booth.funds > C.LIMIT.seatSpendCap) return err('Election Commission spending cap reached in this constituency.');
    const e = pay(seat, C.COST.booth); if (e) return err(e);
    const gain = 0.14 * (1 - loc.org); loc.org = Math.min(1, loc.org + gain); loc.spend += C.COST.booth.funds; seat.stats.booths++;
    return ok(`Booth workers deployed in ${c.n} - organisation ${(loc.org * 100).toFixed(0)}%`);
  },
  ad(state, seat, a) {
    if (!isStr(a.sid) || !cons.get().byState[a.sid]) return err('Unknown state.');
    if (!GROUPS.some(g => g.id === a.group)) return err('Unknown voter group.');
    const e = pay(seat, C.COST.ad); if (e) return err(e);
    const m = (state.ads[a.sid] = state.ads[a.sid] || {}); const p = (m[seat.pid] = m[seat.pid] || {});
    p[a.group] = +((p[a.group] || 0) + 0.5 * (1 - (p[a.group] || 0))).toFixed(4); seat.stats.ads++;
    return ok(`Targeted ad campaign for ${GROUPS.find(g => g.id === a.group).name} in ${stateName(a.sid)}.`);
  },
  poll(state, seat, a, ctx) {
    if (!isStr(a.sid) || !cons.get().byState[a.sid]) return err('Unknown state.');
    const e = pay(seat, C.COST.poll); if (e) return err(e);
    const P = model.prep(state); const rng = new Rng(state);
    const store = (state.intel[seat.pid] = state.intel[seat.pid] || {});
    for (const c of cons.get().byState[a.sid]) store[c.id] = { r: state.round, q: 1, sh: model.intelFor(state, P, c, rng, 0.08) };
    seat.stats.polls++; ctx.intelChanged = true;
    return ok(`Constituency-level poll completed for ${stateName(a.sid)}.`);
  },
  fundraise(state, seat) {
    if (seat.round.fundraise >= C.LIMIT.fundraisePerRound) return err('Fundraising limit reached this round.');
    const e = pay(seat, C.COST.fundraise); if (e) return err(e);
    seat.round.fundraise++; seat.stats.fundraises++;
    const gain = Math.round(26 * (1 - 0.4 * seat.controversy)); seat.funds += gain; seat.controversy += 0.18;
    let msg = `Raised ${gain} funds.`;
    if (seat.controversy >= 1) {
      seat.controversy = 0.45; seat.popularity = clamp(seat.popularity - 0.08, 0.1, 1);
      news(state, 'scandal', `Donations controversy engulfs ${seat.short}; leader rating falls.`); msg += ' A donations scandal broke!';
    }
    return ok(msg);
  },
  rest(state, seat) {
    const e = pay(seat, C.COST.rest); if (e) return err(e);
    seat.energy = Math.min(C.ENERGY_MAX, seat.energy + 30); return ok('Leader rested (+30 energy).');
  },
  attack(state, seat, a) {
    const t = seatOf(state, a.target); if (!isStr(a.target) || !t || t.pid === seat.pid) return err('Pick a rival party.');
    if (allianceOf(state, seat.pid)?.members.includes(t.pid)) return err('You cannot attack an ally.');
    if (seat.round.attack >= C.LIMIT.attackPerRound) return err('One attack per round.');
    if (seat.lastAttack === t.pid) return err('You attacked that party last time - choose another target.');
    const e = pay(seat, C.COST.attack); if (e) return err(e);
    seat.round.attack++; seat.lastAttack = t.pid; seat.stats.attacks++;
    const rng = new Rng(state);
    if (rng.next() < 0.62) {
      const d = 0.04 + rng.next() * 0.03; t.popularity = clamp(t.popularity - d, 0.15, 1);
      return ok(`Opposition research landed: ${t.short}'s leader rating -${(d * 100).toFixed(0)} pts.`);
    }
    seat.popularity = clamp(seat.popularity - 0.05, 0.15, 1);
    news(state, 'attack', `${seat.short}'s smear attempt on ${t.short} backfires and is exposed.`);
    return ok('The attack backfired and was exposed - your leader rating fell.');
  },
  policy(state, seat, a) {
    const is = ISSUES.find(i => i.id === a.issue); if (!is) return err('Unknown issue.');
    if (!Number.isInteger(a.stance) || a.stance < -2 || a.stance > 2) return err('Stance must be an integer from -2 to +2.');
    if (seat.manifesto[is.id] === a.stance) return ok('No change.');
    if (state.round > 1) {
      if (seat.round.policy >= C.LIMIT.policyChangesPerRound) return err('You can change at most 2 positions per round after Round 1.');
      seat.round.policy++; seat.credibility = Math.max(0.3, seat.credibility - 0.05);
      news(state, 'policy', `${seat.short} shifts its position on ${is.name}.`);
    }
    seat.manifesto[is.id] = a.stance;
    return ok(`Position on ${is.name} updated.` + (state.round > 1 ? ' (-5% credibility for flip-flopping)' : ''));
  },
  budget(state, seat, a) {
    if (state.incumbent !== seat.pid) return err('Only the governing party sets the budget.');
    if (seat.round.budget) return err('Budget already set this round.');
    const L = C.BUDGET_LIMITS, cur = state.budget, nb = {};
    let sum = 0;
    for (const k of Object.keys(C.BASE_BUDGET)) {
      const v = a[k]; if (typeof v !== 'number' || !Number.isFinite(v)) return err('Invalid budget numbers.');
      if (v < L.sectorMin || v > L.sectorMax) return err(`Each sector must be between ${L.sectorMin}% and ${L.sectorMax}%.`);
      if (Math.abs(v - cur[k]) > L.sectorStep + 1e-9) return err(`A sector can change by at most ${L.sectorStep} points per round.`);
      nb[k] = v; sum += v;
    }
    if (Math.abs(sum - 100) > 0.5) return err('Allocations must add up to 100%.');
    for (const [k, lo, hi, st] of [['tax', L.taxMin, L.taxMax, L.taxStep], ['deficit', L.defMin, L.defMax, L.defStep]]) {
      const v = a[k]; if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) return err(`${k} out of range.`);
      if (Math.abs(v - cur[k]) > st + 1e-9) return err(`${k} can change by at most ${st} per round.`);
      nb[k] = v;
    }
    Object.assign(state.budget, nb); seat.round.budget = 1;
    news(state, 'budget', `Government announces a new budget: tax ${nb.tax}%, deficit target ${nb.deficit}% of GDP.`);
    return ok('Budget passed.');
  },
  propose(state, seat, a) {
    const t = seatOf(state, a.target); if (!isStr(a.target) || !t || t.pid === seat.pid) return err('Pick another party.');
    if (lastRounds(state)) return err('Alliances are locked in the final rounds.');
    const mine = allianceOf(state, seat.pid), theirs = allianceOf(state, t.pid);
    if (mine && mine === theirs) return err('Already allied.');
    if (mine && theirs) return err('Both parties already belong to alliances.');
    if ((mine || theirs) && (mine || theirs).members.length >= C.LIMIT.maxAllianceSize) return err('Alliance is full.');
    if (state.proposals.some(p => p.from === seat.pid && p.to === t.pid)) return err('Proposal already pending.');
    state.proposals.push({ from: seat.pid, to: t.pid, r: state.round });
    return ok(`Alliance proposal sent to ${t.short}.`, { notify: t.pid });
  },
  respond(state, seat, a) {
    const i = state.proposals.findIndex(p => p.to === seat.pid && p.from === a.from);
    if (i < 0) return err('No such proposal.');
    const [p] = state.proposals.splice(i, 1);
    if (!a.accept) return ok('Proposal declined.');
    if (lastRounds(state)) return err('Alliances are locked in the final rounds.');
    const from = seatOf(state, p.from);
    const A = allianceOf(state, seat.pid), B = allianceOf(state, p.from);
    if (A && B) return err('Both parties already belong to alliances.');
    const ex = A || B;
    if (ex) { if (ex.members.length >= C.LIMIT.maxAllianceSize) return err('Alliance is full.'); ex.members.push(A ? p.from : seat.pid); }
    else state.alliances.push({ id: 'A' + (state.allianceSeq = (state.allianceSeq || 0) + 1), members: [seat.pid, p.from] });
    state.proposals = state.proposals.filter(q => !(q.from === p.from && q.to === seat.pid));
    news(state, 'alliance', `${from.short} and ${seat.short} announce an electoral alliance!`);
    return ok('Alliance formed.');
  },
  breakAlliance(state, seat) {
    const al = allianceOf(state, seat.pid); if (!al) return err('You are not in an alliance.');
    if (lastRounds(state)) return err('Alliances are locked in the final rounds.');
    al.members = al.members.filter(m => m !== seat.pid);
    if (al.members.length < 2) state.alliances = state.alliances.filter(x => x !== al);
    seat.popularity = clamp(seat.popularity - 0.03, 0.1, 1);
    news(state, 'alliance', `${seat.short} quits its alliance.`);
    return ok('You left the alliance.');
  },
};
// Returns {ok, error|msg, notify?, intelChanged?}
function apply(state, pid, a) {
  if (!a || typeof a !== 'object' || typeof a.type !== 'string') return err('Malformed action.');
  if (state.phase !== 'playing') return err('The game is not in progress.');
  const seat = seatOf(state, pid); if (!seat) return err('You are not seated in this game.');
  if (seat.ready) return err('You have already ended your turn.');
  if (!Object.prototype.hasOwnProperty.call(H, a.type)) return err('Unknown action.');
  const ctx = {};
  const r = H[a.type](state, seat, a, ctx);
  if (r.ok) { if (!seat.driving) { seat.autopilot = false; seat.missed = 0; } Object.assign(r, ctx); if (a.type !== 'policy') seat.acted = true; }
  return r;
}
module.exports = { apply, news, local, seatOf, allianceOf, H };
