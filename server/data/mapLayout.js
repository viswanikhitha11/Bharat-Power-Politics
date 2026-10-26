'use strict';
// Seat-cartogram layout: every constituency is one square cell; each state is a compact block placed
// as close as possible to its real geographic position (spiral search, 1-cell gap, no overlaps).
// To use a real geographic map instead, see README "Replacing the map data" (public/js/map.js supports GeoJSON).
const STATES = require('./states');
function layout(scale = 1.15) {
  const blocks = STATES.map(s => {
    const cols = Math.ceil(Math.sqrt(s.seats * 1.15));
    const rows = Math.ceil(s.seats / cols);
    const cx = (s.lon - 68) * scale, cy = (37 - s.lat) * scale;
    return { id: s.id, seats: s.seats, cols, rows, tx: cx - cols / 2, ty: cy - rows / 2 };
  }).sort((a, b) => b.seats - a.seats);
  const placed = [];
  const overlaps = (x, y, b) => placed.some(p => x < p.x + p.cols + 1 && x + b.cols + 1 > p.x && y < p.y + p.rows + 1 && y + b.rows + 1 > p.y);
  for (const b of blocks) {
    const bx = Math.round(b.tx), by = Math.round(b.ty);
    let best = null;
    for (let r = 0; r < 80 && !best; r++) {
      let bd = Infinity;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = bx + dx, y = by + dy;
        if (overlaps(x, y, b)) continue;
        const d = Math.hypot(x - b.tx, y - b.ty);
        if (d < bd) { bd = d; best = { x, y }; }
      }
    }
    placed.push({ ...b, x: best.x, y: best.y });
  }
  const minX = Math.min(...placed.map(p => p.x)), minY = Math.min(...placed.map(p => p.y));
  placed.forEach(p => { p.x += 1 - minX; p.y += 1 - minY; });
  const width = Math.max(...placed.map(p => p.x + p.cols)) + 1;
  const height = Math.max(...placed.map(p => p.y + p.rows)) + 1;
  return { blocks: Object.fromEntries(placed.map(p => [p.id, p])), width, height };
}
module.exports = { layout };
