'use strict';
const fs = require('fs');
const path = require('path');
const STATES = require('./states');
const PARTIES = require('./parties');
const { GROUPS } = require('./issues');
const { layout } = require('./mapLayout');
const { seeded, clamp } = require('../util/rng');

const PRE = ['Ram', 'Shiv', 'Kali', 'Gan', 'Lakshmi', 'Naga', 'Sita', 'Hari', 'Dev', 'Ananta', 'Raj', 'Mahi', 'Ganga', 'Yamuna', 'Narmada', 'Kaveri', 'Vijay', 'Madhu', 'Chandra', 'Surya', 'Tara', 'Kesar', 'Bharat', 'Jai', 'Sagar', 'Pratap', 'Amar', 'Kishan', 'Veer', 'Moti', 'Nand', 'Giri'];
const SUF = ['pur', 'nagar', 'garh', 'abad', 'ganj', 'palli', 'kot', 'gaon', 'puram', 'wada', 'pet', 'bad', 'halli', 'pally', 'nath', 'dih'];
const QUAL = ['', 'North', 'South', 'East', 'West', 'Central'];

let cache = null;
function build() {
  const L = layout();
  const rng = seeded('bharat-power-politics-v1');
  const used = new Set();
  const list = [];
  const byState = {};
  for (const s of STATES) {
    const b = L.blocks[s.id];
    byState[s.id] = [];
    for (let i = 0; i < s.seats; i++) {
      const urbanBias = i === 0 && s.urban > .3 ? .25 : 0; // first seat of urbanised states is a metro-style seat
      const urban = clamp(s.urban + urbanBias + rng.normal() * 0.13, 0.02, 0.98);
      // overlapping group weights then normalised
      const raw = [
        0.26 + rng.normal() * 0.03,
        0.50 * (1 - urban) * (0.4 + s.farm) + 0.03,
        0.65 * urban + 0.05,
        0.46 + rng.normal() * 0.02,
        0.05 + 0.12 * urban,
        0.18 + 0.1 * (1 - s.farm) + rng.normal() * 0.03,
        0.10 + rng.normal() * 0.02,
        0.04 + rng.next() * 0.22, // synthetic, not census data
      ].map(v => Math.max(0.01, v));
      const sum = raw.reduce((a, v) => a + v, 0);
      const g = raw.map(v => +(v / sum).toFixed(4));
      let name, guard = 0;
      do { name = (rng.pick(PRE) + rng.pick(SUF)) + (guard++ > 6 ? ' ' + rng.pick(QUAL.slice(1)) : ''); name = name.trim(); } while (used.has(name) && guard < 60);
      if (used.has(name)) name += ' ' + (i + 1);
      used.add(name);
      const base = {};
      for (const p of PARTIES) {
        const st = p.strength[s.id] ?? 0.12;
        base[p.id] = +clamp(st + 0.25 * p.urbanLean * (urban - 0.35) + rng.normal() * 0.12, 0.02, 0.95).toFixed(3);
      }
      const c = {
        id: `${s.id}-${String(i + 1).padStart(2, '0')}`, idx: list.length, sid: s.id, n: name, num: i + 1,
        x: b.x + (i % b.cols), y: b.y + Math.floor(i / b.cols),
        urban: +urban.toFixed(3), g, electorate: +(1.1 + rng.next() * 1.2 + urban * 0.25).toFixed(2), // lakh -> displayed as lakh voters
        turnout: +(0.52 + rng.next() * 0.2).toFixed(3), others: +(0.05 + rng.next() * 0.1).toFixed(3),
        sigma: +(0.22 + rng.next() * 0.2).toFixed(3), base,
      };
      list.push(c); byState[s.id].push(c);
    }
  }
  // optional user override: data/constituencies.override.json  [{ "id":"UP-01", "name":"Varanasi", "urban":0.4, ... }]
  const ov = path.resolve(__dirname, '..', '..', 'data', 'constituencies.override.json');
  if (fs.existsSync(ov)) {
    try {
      const arr = JSON.parse(fs.readFileSync(ov, 'utf8'));
      for (const o of arr) { const c = list.find(x => x.id === o.id); if (c) Object.assign(c, o, { id: c.id, idx: c.idx }); }
      console.log(`[map] applied ${arr.length} constituency overrides`);
    } catch (e) { console.warn('[map] could not read override file:', e.message); }
  }
  const byId = Object.fromEntries(list.map(c => [c.id, c]));
  return { list, byState, byId, layout: L };
}
function get() { return cache || (cache = build()); }
function publicMap() {
  const { list, layout: L } = get();
  return {
    width: L.width, height: L.height,
    states: STATES.map(s => ({ id: s.id, name: s.name, seats: s.seats, region: s.region, urban: s.urban, farm: s.farm, block: { x: L.blocks[s.id].x, y: L.blocks[s.id].y, cols: L.blocks[s.id].cols, rows: L.blocks[s.id].rows } })),
    constituencies: list.map(c => ({ id: c.id, i: c.idx, s: c.sid, n: c.n, x: c.x, y: c.y, u: c.urban, g: c.g, e: c.electorate, t: c.turnout })),
    groups: GROUPS,
  };
}
module.exports = { get, publicMap };
