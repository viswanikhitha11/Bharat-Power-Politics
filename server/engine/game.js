'use strict';
// Game lifecycle: lobby -> playing (simultaneous rounds) -> finished (election results).
const C = require('./constants');
const PARTIES = require('../data/parties');
const STATES = require('../data/states');
const cons = require('../data/constituencies');
const { ISSUES, GROUPS } = require('../data/issues');
const model = require('./model');
const eco = require('./economy');
const events = require('./events');
const A = require('./actions');
const bots = require('./bots');
const { Rng, hashSeed, clamp } = require('../util/rng');

const err = error => ({ ok: false, error });
const ok = (extra) => ({ ok: true, ...(extra || {}) });
const meta = pid => PARTIES.find(p => p.id === pid);
const humans = st => st.seats.filter(s => !s.bot);

function sanitizeSettings(s = {}, cur = {}) {
  const out = { rounds: 10, timer: 120, maxPlayers: 7, incumbent: 'random', ...cur };
  if (s.rounds !== undefined) { const v = parseInt(s.rounds, 10); if (v >= C.ROUNDS_MIN && v <= C.ROUNDS_MAX) out.rounds = v; }
  if (s.timer !== undefined) { const v = parseInt(s.timer, 10); if (C.TIMERS.includes(v)) out.timer = v; }
  if (s.maxPlayers !== undefined) { const v = parseInt(s.maxPlayers, 10); if (v >= 2 && v <= 7) out.maxPlayers = v; }
  if (s.incumbent === 'random' || s.incumbent === 'none') out.incumbent = s.incumbent;
  return out;
}
function create({ code, hostId, hostName, settings }) {
  const st = {
    code, phase: 'lobby', createdAt: Date.now(), hostId, settings: sanitizeSettings(settings),
    seats: [], round: 0, totalRounds: 0, rng: hashSeed(code + ':' + Date.now() + ':' + Math.random()),
    local: {}, ads: {}, mood: {}, news: [], alliances: [], proposals: [], intel: {}, roundLog: [], incumbent: null,
    economy: null, budget: null, approval: null, deadline: null, results: null, ranked: false,
  };
  joinHuman(st, hostId, hostName);
  return st;
}
function sortSeats(st) { st.seats.sort((a, b) => PARTIES.findIndex(p => p.id === a.pid) - PARTIES.findIndex(p => p.id === b.pid)); }
function freeParty(st) { return PARTIES.find(p => !st.seats.some(s => s.pid === p.id)); }
function joinHuman(st, userId, name) {
  const ex = st.seats.find(s => s.userId === userId);
  if (ex) { ex.connected = true; return ok({ seat: ex, rejoin: true }); }
  if (st.phase !== 'lobby') return err('This game has already started.');
  if (st.seats.length >= st.settings.maxPlayers) return err('Room is full.');
  const p = freeParty(st); if (!p) return err('Room is full.');
  const seat = { pid: p.id, userId, name: String(name).slice(0, 24), bot: null, ready: false, connected: true };
  st.seats.push(seat); sortSeats(st); return ok({ seat });
}
function chooseParty(st, userId, pid) {
  if (st.phase !== 'lobby') return err('Game already started.');
  const seat = st.seats.find(s => s.userId === userId); if (!seat) return err('Not in room.');
  if (!meta(pid)) return err('Unknown party.');
  if (st.seats.some(s => s.pid === pid && s !== seat)) return err('That party is already taken.');
  seat.pid = pid; seat.ready = false; sortSeats(st); return ok();
}
function addBot(st, userId, level, pid) {
  if (st.phase !== 'lobby') return err('Game already started.');
  if (userId !== st.hostId) return err('Only the host can add AI parties.');
  if (st.seats.length >= st.settings.maxPlayers) return err('Room is full.');
  const p = pid ? (st.seats.some(s => s.pid === pid) ? null : meta(pid)) : freeParty(st); if (!p) return err('No free party.');
  const lv = ['easy', 'normal', 'hard'].includes(level) ? level : 'normal';
  st.seats.push({ pid: p.id, userId: null, name: p.leader.name + ' (AI)', bot: lv, ready: true, connected: true }); sortSeats(st); return ok();
}
function removeSeat(st, userId, pid) {
  if (st.phase !== 'lobby') return err('Game already started.');
  const seat = st.seats.find(s => s.pid === pid); if (!seat) return err('No such seat.');
  if (userId !== st.hostId) return err('Only the host can remove players.');
  if (seat.userId === st.hostId) return err('Host cannot remove themselves.');
  st.seats = st.seats.filter(s => s !== seat); return ok({ removedUser: seat.userId });
}
// returns {ok, closed} ; in lobby the seat is removed, in game it becomes autopilot
function leave(st, userId) {
  const seat = st.seats.find(s => s.userId === userId); if (!seat) return ok();
  if (st.phase === 'lobby') {
    st.seats = st.seats.filter(s => s !== seat);
    if (!humans(st).length) return ok({ closed: true });
    if (st.hostId === userId) st.hostId = humans(st)[0].userId;
  } else if (st.phase === 'playing') {
    seat.connected = false; seat.autopilot = true; seat.left = true;
    if (!humans(st).some(s => !s.left)) return ok({ closed: true });
    if (st.hostId === userId) st.hostId = humans(st).find(s => !s.left).userId;
    if (st.seats.every(s => s.ready || s.bot || s.left)) { /* resolved by caller via tick */ }
  }
  return ok();
}
function setReady(st, userId, ready) {
  const seat = st.seats.find(s => s.userId === userId); if (!seat || st.phase !== 'lobby') return err('Cannot change ready state.');
  seat.ready = !!ready; return ok();
}
function setSettings(st, userId, s) {
  if (st.phase !== 'lobby') return err('Game already started.');
  if (userId !== st.hostId) return err('Only the host can change settings.');
  st.settings = sanitizeSettings(s, st.settings);
  while (st.seats.length > st.settings.maxPlayers) { const b = [...st.seats].reverse().find(x => x.bot); if (!b) break; st.seats = st.seats.filter(x => x !== b); }
  return ok();
}

function start(st, userId) {
  if (st.phase !== 'lobby') return err('Already started.');
  if (userId !== st.hostId) return err('Only the host can start the game.');
  if (st.seats.length < 2) return err('Need at least 2 parties (add AI parties to play solo).');
  if (st.seats.some(s => !s.bot && s.userId !== st.hostId && !s.ready)) return err('Not all players are ready.');
  const rng = new Rng(st);
  st.phase = 'playing'; st.round = 1; st.totalRounds = st.settings.rounds;
  st.ranked = humans(st).length >= 2;
  st.economy = eco.initialEconomy(); st.budget = eco.initialBudget();
  st.approval = { national: 50, groups: {} }; st.approval.groups = eco.groupApproval(st);
  st.incumbent = st.settings.incumbent === 'none' ? null : rng.pick(st.seats).pid;
  st.startedAt = Date.now();
  for (const s of st.seats) {
    const m = meta(s.pid);
    Object.assign(s, {
      short: m.short, leaderName: m.leader.name, appeal: m.appeal.slice(), leader: { charisma: m.leader.charisma, trust: m.leader.trust, vision: m.leader.vision, stamina: m.leader.stamina },
      funds: C.START_FUNDS + (s.pid === st.incumbent ? 10 : 0), ap: C.AP_PER_ROUND, energy: C.ENERGY_MAX,
      popularity: +(0.2 + 0.06 * (0.6 * m.leader.charisma + 0.4 * m.leader.trust)).toFixed(3), basePop: 0, credibility: 1, controversy: 0,
      manifesto: Object.fromEntries(ISSUES.map((is, i) => [is.id, m.stance[i]])),
      round: { rallies: {}, fundraise: 0, attack: 0, policy: 0, budget: 0 }, lastAttack: null,
      autopilot: false, missed: 0, autopilotRounds: 0, acted: false, ready: !!s.bot, left: false,
      stats: { rallies: 0, booths: 0, ads: 0, polls: 0, attacks: 0, fundraises: 0, spent: 0 },
    });
    s.basePop = s.popularity;
    if (!s.bot) s.ready = false;
  }
  A.news(st, 'system', `Campaign season begins! ${st.totalRounds} rounds until polling day.`);
  if (st.incumbent) A.news(st, 'system', `${meta(st.incumbent).name} is the incumbent government.`);
  refreshIntel(st);
  beginRound(st);
  if (allReady(st)) resolveRound(st); // all-AI table
  return ok();
}
function refreshIntel(st) {
  const P = model.prep(st), rng = new Rng(st), { list } = cons.get();
  for (const s of st.seats) {
    const store = (st.intel[s.pid] = st.intel[s.pid] || {});
    for (const c of list) {
      const old = store[c.id];
      if (old && old.q === 1 && st.round - old.r <= 2) continue; // keep recent precise poll
      store[c.id] = { r: st.round, q: 0, sh: model.intelFor(st, P, c, rng, 0.35) };
    }
  }
}
function beginRound(st) {
  for (const s of st.seats) {
    s.ap = C.AP_PER_ROUND; s.acted = false;
    s.round = { rallies: {}, fundraise: 0, attack: 0, policy: 0, budget: 0 };
    s.ready = false;
  }
  st.deadline = st.settings.timer ? Date.now() + st.settings.timer * 1000 : null;
  for (const s of st.seats) {
    if (s.bot) { bots.turn(st, s, s.bot); s.ready = true; }
    else if (s.autopilot) { bots.turn(st, s, 'normal'); s.ready = true; s.autopilotRounds++; }
  }
}
function allReady(st) { return st.seats.every(s => s.ready); }

function act(st, userId, action) {
  const seat = st.seats.find(s => s.userId === userId); if (!seat) return err('You are not in this game.');
  if (st.phase !== 'playing') return err('The game is not in progress.');
  if (action && action.type === 'endTurn') {
    if (seat.ready) return ok();
    seat.autopilot = false; seat.missed = 0; seat.ready = true;
    const r = ok({ resolved: false });
    if (allReady(st)) { resolveRound(st); r.resolved = true; r.newRound = true; }
    return r;
  }
  if (action && action.type === 'resume') { seat.autopilot = false; seat.missed = 0; return ok(); }
  if (seat.left) return err('You left this game.');
  const r = A.apply(st, seat.pid, action);
  return r;
}
// Called periodically. Returns true when state changed meaningfully (round resolved).
function tick(st, now = Date.now()) {
  if (st.phase !== 'playing') return false;
  let force = false;
  if (st.deadline && now >= st.deadline) force = true;
  // absent players (disconnected > 60s) are auto-readied so others are never blocked
  for (const s of humans(st)) {
    if (!s.ready && !s.connected) { s.discAt = s.discAt || now; if (now - s.discAt > 60000) { s.ready = true; s.missed++; if (s.missed >= 2) s.autopilot = true; } }
    else if (s.connected) s.discAt = null;
  }
  if (force) for (const s of humans(st)) if (!s.ready) { s.ready = true; s.missed++; if (s.missed >= 2) s.autopilot = true; }
  if (allReady(st)) { resolveRound(st); return true; }
  return false;
}
function helpersFor(st, rng) {
  return {
    shock: d => { for (const k of Object.keys(d)) st.economy.shock[k] += d[k]; },
    eco: (k, d) => { st.economy[k] = clamp(st.economy[k] + d, 5, 95); },
    bonus: d => { st.economy.bonus += d; },
    mood: (sid, d) => { st.mood[sid] = (st.mood[sid] || 0) + d; },
    pop: (pid, d) => { const s = A.seatOf(st, pid); if (s) s.popularity = clamp(s.popularity + d, 0.15, 1); },
  };
}
function resolveRound(st) {
  const rng = new Rng(st);
  // public news about rallies
  const by = {};
  for (const l of st.roundLog) { if (l.kind !== 'rally') continue; const e = (by[l.pid] = by[l.pid] || { n: 0, s: [] }); e.n++; if (!e.s.includes(l.sid)) e.s.push(l.sid); }
  for (const [pid, e] of Object.entries(by)) A.news(st, 'rally', `${meta(pid).short} held ${e.n} rall${e.n > 1 ? 'ies' : 'y'} in ${e.s.slice(0, 4).map(id => STATES.find(s => s.id === id).name).join(', ')}.`);
  st.roundLog = [];
  // decay
  for (const m of Object.values(st.local)) for (const l of Object.values(m)) { l.mom *= 0.65; l.org *= 0.97; }
  for (const sid of Object.keys(st.ads)) for (const pid of Object.keys(st.ads[sid])) for (const g of Object.keys(st.ads[sid][pid])) { st.ads[sid][pid][g] *= 0.7; if (st.ads[sid][pid][g] < 0.01) delete st.ads[sid][pid][g]; }
  for (const s of st.seats) {
    s.popularity += 0.08 * (s.basePop - s.popularity); s.controversy = Math.max(0, s.controversy - 0.05);
    s.energy = Math.min(C.ENERGY_MAX, s.energy + 12);
    if (!s.bot && !s.acted && !s.left) { /* idle round */ }
  }
  st.proposals = st.proposals.filter(p => st.round - p.r < 3);
  // economy & events
  eco.step(st);
  const ev = events.roll(st, rng, helpersFor(st, rng));
  if (ev) A.news(st, 'event', `${ev.title}: ${ev.text}`);
  // income (rubber-banded: trailing parties get small-donor bonus)
  const proj = model.projection(st); const avg = 1 / st.seats.length;
  st.seats.forEach((s, i) => {
    const share = proj.votes[i];
    s.funds += Math.round(20 + 60 * share + (s.pid === st.incumbent ? 10 : 0) + (share < avg ? 5 : 0));
    if (s.funds > C.LIMIT.hoardThreshold) s.funds -= Math.round(0.15 * (s.funds - C.LIMIT.hoardThreshold));
  });
  // public tracking poll (same noisy numbers for everyone)
  const tr = st.seats.map((s, i) => [s.short, Math.max(0, proj.votes[i] + rng.normal() * 0.02)]);
  const tot = tr.reduce((a, [, v]) => a + v, 0);
  tr.sort((a, b) => b[1] - a[1]);
  A.news(st, 'poll', `Tracking poll (Round ${st.round}): ` + tr.map(([n, v]) => `${n} ${(v / tot * 100 * (1 - 0.1)).toFixed(0)}%`).join(' | '));
  st.round++;
  if (st.round > st.totalRounds) { finish(st, rng); return; }
  refreshIntel(st);
  beginRound(st);
  if (allReady(st)) resolveRound(st); // all-bot/autopilot tables resolve instantly
}
function finish(st, rng) {
  const R = model.runElection(st, rng);
  const seats = st.seats;
  const bloc = seats.map(s => { const al = A.allianceOf(st, s.pid); return al ? al.id : null; });
  const blocs = [];
  seats.forEach((s, i) => {
    const key = bloc[i] || ('solo-' + s.pid);
    let b = blocs.find(x => x.key === key);
    if (!b) blocs.push(b = { key, members: [], seats: 0, voteShare: 0 });
    b.members.push(s.pid); b.seats += R.seatsWon[i]; b.voteShare += R.votes[i];
  });
  blocs.sort((a, b) => b.seats - a.seats || b.voteShare - a.voteShare);
  const best = blocs[0];
  const pmIdx = best.members.map(pid => seats.findIndex(s => s.pid === pid)).sort((a, b) => R.seatsWon[b] - R.seatsWon[a])[0];
  const gov = { type: best.seats >= C.MAJORITY ? 'majority' : 'hung', pm: seats[pmIdx].pid, members: best.members, seats: best.seats, landslide: best.seats >= C.SUPERMAJORITY };
  const order = seats.map((s, i) => ({ s, i })).sort((a, b) => (b.s.pid === gov.pm) - (a.s.pid === gov.pm) || R.seatsWon[b.i] - R.seatsWon[a.i] || R.votes[b.i] - R.votes[a.i]);
  const parties = order.map(({ s, i }, rank) => ({ pid: s.pid, seats: R.seatsWon[i], voteShare: +R.votes[i].toFixed(4), rank: rank + 1, bloc: bloc[i], inGov: gov.members.includes(s.pid), pm: s.pid === gov.pm }));
  const stateRes = {};
  for (const [sid, arr] of Object.entries(R.stateSeats)) stateRes[sid] = Object.fromEntries(seats.map((s, i) => [s.pid, arr[i]]).filter(([, v]) => v > 0));
  st.results = {
    pids: seats.map(s => s.pid), per: R.per, order: rng.shuffle(R.per.map(p => p.id)), parties, blocs: blocs.map(b => ({ members: b.members, seats: b.seats, voteShare: +b.voteShare.toFixed(4) })),
    gov, states: stateRes, majority: C.MAJORITY, totalSeats: C.SEATS_TOTAL,
  };
  st.phase = 'finished'; st.finishedAt = Date.now(); st.deadline = null;
  A.news(st, 'system', `Polling day! ${meta(gov.pm).name} ${gov.type === 'majority' ? 'wins a majority' : 'emerges as the largest bloc'} with ${gov.seats} seats.`);
}
// Ranked points per human seat (anti-farming: needs >=2 humans, >=6 rounds, mostly non-autopilot)
function rankedPoints(st) {
  const out = [];
  if (!st.ranked || st.totalRounds < 6 || !st.results) return out;
  for (const p of st.results.parties) {
    const s = st.seats.find(x => x.pid === p.pid); if (!s || s.bot || !s.userId) continue;
    if (s.autopilotRounds > st.totalRounds * 0.3) continue;
    let pts = Math.round(p.seats / C.SEATS_TOTAL * 100);
    if (p.pm) pts += 40 + (st.results.gov.type === 'majority' ? 20 : 0);
    else if (p.inGov) pts += 15;
    out.push({ userId: s.userId, pid: p.pid, points: pts, seats: p.seats, won: p.pm });
  }
  return out;
}
module.exports = { create, joinHuman, chooseParty, addBot, removeSeat, leave, setReady, setSettings, start, act, tick, rankedPoints, humans, meta, sanitizeSettings, resolveRound };
