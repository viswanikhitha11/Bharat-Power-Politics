// Interactive India seat-cartogram (SVG). One square per constituency, grouped per state, placed geographically.
// Optional: if /api/geo returns a GeoJSON of Indian states, a "Geographic" view is offered (state-level shapes).
import { h } from './ui.js';
const NS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); return e; };
const CELL = 16;

export function createMap(container, data, opts = {}) {
  const W = data.width * CELL, H = data.height * CELL;
  const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
  const gBoxes = S('g'), gCells = S('g'), gLabels = S('g');
  svg.append(gBoxes, gCells, gLabels);
  const tip = h('div', { class: 'tip' });
  container.append(svg, tip);
  const cells = {}, boxes = {};
  for (const s of data.states) {
    const b = s.block;
    const box = S('rect', { class: 'sbox', x: b.x * CELL - 3, y: b.y * CELL - 3, width: b.cols * CELL + 5, height: b.rows * CELL + 5, rx: 6 });
    gBoxes.append(box); boxes[s.id] = box;
    if (s.seats >= 3) { const t = S('text', { class: 'slabel', x: b.x * CELL - 1, y: b.y * CELL - 6 }); t.textContent = s.id; gLabels.append(t); }
  }
  for (const c of data.constituencies) {
    const r = S('rect', { class: 'cell', x: c.x * CELL + 0.5, y: c.y * CELL + 0.5, width: CELL - 2, height: CELL - 2, rx: 3, fill: '#2a3158', 'data-id': c.id });
    gCells.append(r); cells[c.id] = r;
  }
  const byId = Object.fromEntries(data.constituencies.map(c => [c.id, c]));
  const stateName = Object.fromEntries(data.states.map(s => [s.id, s.name]));
  // pan / zoom via viewBox
  let vb = { x: 0, y: 0, w: W, h: H }; const apply = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const toSvg = (cx, cy) => { const r = svg.getBoundingClientRect(); const sc = Math.max(vb.w / r.width, vb.h / r.height); const ox = (r.width - vb.w / sc) / 2, oy = (r.height - vb.h / sc) / 2; return { x: vb.x + (cx - r.left - ox) * sc, y: vb.y + (cy - r.top - oy) * sc, sc }; };
  svg.addEventListener('wheel', e => {
    e.preventDefault(); const f = e.deltaY < 0 ? 0.85 : 1.18; const p = toSvg(e.clientX, e.clientY);
    const nw = Math.min(W * 1.2, Math.max(W / 8, vb.w * f)), k = nw / vb.w;
    vb = { x: p.x - (p.x - vb.x) * k, y: p.y - (p.y - vb.y) * k, w: nw, h: vb.h * k }; apply();
  }, { passive: false });
  let drag = null, moved = 0;
  svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vb: { ...vb } }; moved = 0; });
  window.addEventListener('pointermove', e => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
    if (moved > 5) { const r = svg.getBoundingClientRect(); const sc = Math.max(vb.w / r.width, vb.h / r.height); vb.x = drag.vb.x - dx * sc; vb.y = drag.vb.y - dy * sc; apply(); }
  });
  window.addEventListener('pointerup', () => { drag = null; });
  svg.addEventListener('click', e => {
    if (moved > 5) return; const id = e.target.getAttribute && e.target.getAttribute('data-id'); if (id && opts.onSelect) opts.onSelect(id);
  });
  svg.addEventListener('mousemove', e => {
    const id = e.target.getAttribute && e.target.getAttribute('data-id');
    if (!id || !opts.tooltip) { tip.style.display = 'none'; return; }
    const r = container.getBoundingClientRect(); tip.replaceChildren(...opts.tooltip(byId[id], stateName[byId[id].s]));
    tip.style.display = 'block'; tip.style.left = Math.min(r.width - 240, e.clientX - r.left + 14) + 'px'; tip.style.top = Math.max(4, e.clientY - r.top + 14) + 'px';
  });
  svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  let sel = null, hlState = null;
  return {
    svg, cells,
    reset() { vb = { x: 0, y: 0, w: W, h: H }; apply(); },
    zoom(f) { const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2; vb = { x: cx - vb.w * f / 2, y: cy - vb.h * f / 2, w: vb.w * f, h: vb.h * f }; apply(); },
    paint(fn) { for (const c of data.constituencies) { const p = fn(c) || {}; const el = cells[c.id]; el.setAttribute('fill', p.fill || '#2a3158'); el.style.opacity = p.opacity ?? 1; } },
    select(id) { if (sel && cells[sel]) cells[sel].classList.remove('sel'); sel = id; if (id && cells[id]) { cells[id].classList.add('sel'); cells[id].parentNode.append(cells[id]); } },
    highlightState(sid) { if (hlState && boxes[hlState]) boxes[hlState].classList.remove('hl'); hlState = sid; if (sid && boxes[sid]) boxes[sid].classList.add('hl'); },
    flash(id) { const el = cells[id]; if (!el) return; el.classList.remove('flash'); void el.getBoundingClientRect(); el.classList.add('flash'); },
    focusState(sid) { const s = data.states.find(x => x.id === sid); if (!s) return; const b = s.block; const w = Math.max(b.cols * CELL * 3.2, W / 4); const hh = w * (H / W);
      vb = { x: (b.x + b.cols / 2) * CELL - w / 2, y: (b.y + b.rows / 2) * CELL - hh / 2, w, h: hh }; apply(); },
    destroy() { container.replaceChildren(); },
  };
}

// ---- optional geographic state map -------------------------------------------------------------
const norm = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
const ALIASES = { jammuandkashmir: 'JK', andamanandnicobarislands: 'AN', andamanandnicobar: 'AN', nctofdelhi: 'DL', delhi: 'DL', dadraandnagarhavelianddamananddiu: 'DD', dadraandnagarhaveli: 'DD', damananddiu: 'DD', odisha: 'OD', orissa: 'OD', uttaranchal: 'UK', puducherry: 'PY', pondicherry: 'PY' };
export async function loadGeo(states) {
  try {
    const r = await fetch('/api/geo'); if (!r.ok) return null; const gj = await r.json();
    const idByName = {}; for (const s of states) idByName[norm(s.name)] = s.id; Object.assign(idByName, ALIASES);
    const feats = []; let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const f of gj.features || []) {
      const p = f.properties || {}; const nm = p.st_nm || p.ST_NM || p.NAME_1 || p.name || p.STATE || p.State || p.state;
      const id = idByName[norm(nm)]; if (!id || !f.geometry) continue;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
      for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
      feats.push({ id, polys });
    }
    if (!feats.length) return null; return { feats, minx, miny, maxx, maxy };
  } catch { return null; }
}
export function createGeoMap(container, geo, opts = {}) {
  const sc = 900 / (geo.maxx - geo.minx), Wd = 900, Hd = (geo.maxy - geo.miny) * sc * 1.15;
  const svg = S('svg', { viewBox: `0 0 ${Wd} ${Hd}`, preserveAspectRatio: 'xMidYMid meet' });
  const paths = {};
  for (const f of geo.feats) {
    const d = f.polys.map(poly => poly.map(ring => 'M' + ring.map(([x, y]) => `${((x - geo.minx) * sc).toFixed(1)},${((geo.maxy - y) * sc * 1.15).toFixed(1)}`).join('L') + 'Z').join('')).join('');
    const p = S('path', { d, class: 'cell', fill: '#2a3158', 'data-state': f.id }); svg.append(p); (paths[f.id] = paths[f.id] || []).push(p);
  }
  svg.addEventListener('click', e => { const id = e.target.getAttribute('data-state'); if (id && opts.onState) opts.onState(id); });
  container.append(svg);
  return { svg, paintState(fn) { for (const [id, ps] of Object.entries(paths)) { const c = fn(id) || {}; ps.forEach(p => { p.setAttribute('fill', c.fill || '#2a3158'); p.style.opacity = c.opacity ?? 1; }); } }, destroy() { container.replaceChildren(); } };
}
