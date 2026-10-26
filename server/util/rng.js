'use strict';
// Deterministic PRNG whose state lives inside the (JSON-serialisable) game object.
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
class Rng {
  // holder: object with numeric property `key` used as state
  constructor(holder, key = 'rng') { this.h = holder; this.k = key; }
  next() {
    const h = this.h; h[this.k] = (h[this.k] + 0x6D2B79F5) >>> 0;
    let t = h[this.k];
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  normal() { let u = 0; while (u === 0) u = this.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next()); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
}
function seeded(seedStr) { const h = { s: hashSeed(seedStr) }; return new Rng(h, 's'); }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
module.exports = { hashSeed, Rng, seeded, clamp };
