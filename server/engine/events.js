'use strict';
const STATES = require('../data/states');
const { clamp } = require('../util/rng');
// Each event: weight, build(state, rng, h) -> { title, text } and applies effects via helpers h.
const coastal = STATES.filter(s => s.coastal).map(s => s.id);
const pickStates = (rng, ids, n) => rng.shuffle(ids).slice(0, n);
const names = ids => ids.map(id => STATES.find(s => s.id === id).name).join(', ');
const EVENTS = [
  { id: 'monsoon_fail', w: 1, run(s, r, h) { h.shock({ g: -0.6, i: 1.0 }); h.eco('agri', -8); h.bonus(-3); return ['Monsoon fails', 'A weak monsoon hits harvests and pushes up food prices.']; } },
  { id: 'bumper', w: 1, run(s, r, h) { h.shock({ g: 0.5, i: -0.6 }); h.eco('agri', 6); h.bonus(2); return ['Bumper harvest', 'Record foodgrain output eases prices and lifts rural incomes.']; } },
  { id: 'oil', w: 1, run(s, r, h) { h.shock({ g: -0.5, i: 1.2 }); h.bonus(-2); return ['Global oil shock', 'Crude prices spike abroad; fuel and transport costs rise at home.']; } },
  { id: 'tech', w: 1, run(s, r, h) { h.shock({ g: 0.7, u: -0.6 }); h.bonus(2); return ['Tech investment boom', 'Global firms announce big manufacturing and tech investments in India.']; } },
  { id: 'cyclone', w: 1, run(s, r, h) { const ids = pickStates(r, coastal, 3); h.eco('infra', -4); ids.forEach(id => h.mood(id, -0.35)); return ['Cyclone strikes the coast', `Relief operations are tested in ${names(ids)}. Voters there judge the government harshly.`]; } },
  { id: 'floods', w: 1, run(s, r, h) { const ids = pickStates(r, ['BR', 'AS', 'UP', 'WB', 'OD', 'KL'], 2); h.eco('infra', -3); ids.forEach(id => h.mood(id, -0.3)); return ['Severe floods', `Floods displace thousands across ${names(ids)}.`]; } },
  { id: 'jobs_protest', w: 1, run(s, r, h) { h.shock({ u: 0.7 }); h.bonus(-2); return ['Youth job protests', 'Unemployed graduates march in several cities demanding recruitment.']; } },
  { id: 'health', w: 1, run(s, r, h) { h.eco('health', -6); h.shock({ g: -0.4 }); h.bonus(-2); return ['Health scare', 'A seasonal epidemic overwhelms district hospitals.']; } },
  { id: 'farm_protest', w: 1, run(s, r, h) { const ids = pickStates(r, ['PB', 'HR', 'UP', 'RJ', 'MP', 'MH'], 3); ids.forEach(id => h.mood(id, -0.25)); return ['Farmers\' protest', `Farm unions camp in ${names(ids)}, demanding better support prices.`]; } },
  { id: 'summit', w: 1, run(s, r, h) { h.bonus(3); return ['Diplomatic success', 'A well-received international summit boosts national pride.']; } },
  { id: 'market', w: 1, run(s, r, h) { h.shock({ g: 0.4 }); h.bonus(1.5); return ['Stock-market rally', 'Benchmark indices touch an all-time high.']; } },
  { id: 'heat', w: 1, run(s, r, h) { h.eco('health', -3); h.shock({ g: -0.2 }); return ['Record heatwave', 'Power demand surges amid blistering temperatures.']; } },
  { id: 'scandal', w: 1.2, run(s, r, h) { const seat = r.pick(s.seats); h.pop(seat.pid, -0.07); return ['Corruption allegations', `Media reports allege irregularities involving ${seat.leaderName}'s circle. ${seat.short}'s leader rating dips.`]; } },
  { id: 'hero', w: 1, run(s, r, h) { const seat = r.pick(s.seats); h.pop(seat.pid, 0.05); return ['Viral speech', `${seat.leaderName}'s speech goes viral, lifting ${seat.short}'s leader rating.`]; } },
  { id: 'calm', w: 1.5, run() { return ['Quiet week', 'No major headlines - campaigns dominate the news cycle.']; } },
];
function roll(state, rng, helpers) {
  if (rng.next() > 0.75) return null;
  const total = EVENTS.reduce((a, e) => a + e.w, 0);
  let x = rng.next() * total, ev = EVENTS[0];
  for (const e of EVENTS) { x -= e.w; if (x <= 0) { ev = e; break; } }
  const [title, text] = ev.run(state, rng, helpers);
  return { id: ev.id, title, text };
}
module.exports = { roll, EVENTS };
