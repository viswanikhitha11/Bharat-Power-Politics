'use strict';
// Balance simulation: bots only. Usage: node tests/simulate.js [games] [players] [rounds]
const G = require('../server/engine/game');
const PARTIES = require('../server/data/parties');
const n = +process.argv[2] || 5, players = +process.argv[3] || 7, rounds = +process.argv[4] || 10;
const wins = {}, seatSum = {}; let majority = 0, tmax = 0;
for (let g = 0; g < n; g++) {
  const st = G.create({ code: 'SIM' + g, hostId: 1, hostName: 'sim', settings: { rounds, timer: 0, maxPlayers: players } });
  st.seats = []; // all bots
  const lv = ['easy', 'normal', 'hard'];
  for (let i = 0; i < players; i++) st.seats.push({ pid: PARTIES[i].id, userId: null, name: 'bot', bot: lv[i % 3], ready: true, connected: true });
  const t0 = Date.now();
  const r = G.start(st, 1); if (!r.ok) throw new Error(r.error);
  tmax = Math.max(tmax, Date.now() - t0);
  if (st.phase !== 'finished') throw new Error('did not finish: ' + st.phase);
  const res = st.results;
  const sum = res.parties.reduce((a, p) => a + p.seats, 0); if (sum !== 543) throw new Error('seat sum ' + sum);
  wins[res.gov.pm] = (wins[res.gov.pm] || 0) + 1; if (res.gov.type === 'majority') majority++;
  res.parties.forEach(p => seatSum[p.pid] = (seatSum[p.pid] || 0) + p.seats);
  console.log(`game ${g}: PM=${res.gov.pm} ${res.gov.seats} seats (${res.gov.type})  |  ` + res.parties.map(p => `${p.pid}:${p.seats}`).join(' '));
}
console.log('PM wins:', wins, ' majorities:', majority + '/' + n, ' max game time ms:', tmax);
console.log('avg seats:', Object.fromEntries(Object.entries(seatSum).map(([k, v]) => [k, Math.round(v / n)])));
