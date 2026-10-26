'use strict';
// Tiny sliding-window limiter (no dependencies).
function makeLimiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.every(t => now - t > windowMs)) hits.delete(k); }, windowMs * 2).unref();
  return function allow(key) {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) { hits.set(key, arr); return false; }
    arr.push(now); hits.set(key, arr); return true;
  };
}
function expressLimiter(max, windowMs) {
  const allow = makeLimiter(max, windowMs);
  return (req, res, next) => allow(req.ip) ? next() : res.status(429).json({ error: 'Too many requests, slow down.' });
}
module.exports = { makeLimiter, expressLimiter };
