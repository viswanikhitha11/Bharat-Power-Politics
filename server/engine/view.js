'use strict';
// Builds a per-player view of the game. Hidden information (other parties' funds, AP, intel, true local
// strengths) is never included - the client cannot read what the server does not send.
const PARTIES = require('../data/parties');
const A = require('./actions');

function lobbyView(st, userId) {
  return {
    code: st.code, phase: st.phase, hostId: st.hostId === userId ? 'me' : 'other', isHost: st.hostId === userId,
    settings: st.settings,
    seats: st.seats.map(s => ({ pid: s.pid, name: s.name, bot: s.bot, ready: s.ready, connected: s.connected, you: s.userId === userId, host: s.userId === st.hostId })),
  };
}
function view(st, userId, withIntel) {
  const v = lobbyView(st, userId);
  if (st.phase === 'lobby') return v;
  const me = st.seats.find(s => s.userId === userId);
  Object.assign(v, {
    round: st.round, totalRounds: st.totalRounds, deadline: st.deadline, serverTime: Date.now(), ranked: st.ranked, incumbent: st.incumbent,
    economy: { ...st.economy, shock: undefined }, budget: st.budget, approval: st.approval,
    alliances: st.alliances, news: st.news.slice(-80),
    parties: st.seats.map(s => ({
      pid: s.pid, name: s.name, bot: s.bot, ready: s.ready, connected: s.connected, you: s.userId === userId, autopilot: s.autopilot,
      popularity: +s.popularity.toFixed(3), credibility: +s.credibility.toFixed(2), manifesto: s.manifesto, left: s.left,
    })),
  });
  if (me) {
    v.me = {
      pid: me.pid, funds: me.funds, ap: me.ap, apMax: 6, energy: Math.round(me.energy), popularity: me.popularity, credibility: me.credibility,
      controversy: +me.controversy.toFixed(2), counters: me.round, stats: me.stats, ready: me.ready,
      local: Object.fromEntries(Object.entries(st.local).filter(([, m]) => m[me.pid]).map(([cid, m]) => [cid, { o: +m[me.pid].org.toFixed(2), m: +m[me.pid].mom.toFixed(2), s: m[me.pid].spend }])),
      ads: Object.fromEntries(Object.entries(st.ads).filter(([, m]) => m[me.pid]).map(([sid, m]) => [sid, m[me.pid]])),
      proposalsIn: st.proposals.filter(p => p.to === me.pid).map(p => p.from),
      proposalsOut: st.proposals.filter(p => p.from === me.pid).map(p => p.to),
    };
    if (withIntel) v.intel = st.intel[me.pid] || {};
  }
  if (st.phase === 'finished') v.results = st.results;
  return v;
}
module.exports = { view, lobbyView };
