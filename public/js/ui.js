// Tiny DOM helpers. All text goes through text nodes (never innerHTML) so user-supplied names cannot inject markup.
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  const add = c => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else e.append(c instanceof Node ? c : document.createTextNode(String(c))); };
  kids.forEach(add);
  return e;
}
export function put(el, ...kids) {
  while (el.firstChild) el.removeChild(el.firstChild);
  const add = c => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.append(c instanceof Node ? c : document.createTextNode(String(c))); };
  kids.forEach(add); return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const fmt = n => Number(n).toLocaleString('en-IN');
export const pct = (v, d = 0) => (v * 100).toFixed(d) + '%';
export function toast(text, type = '') {
  const t = h('div', { class: 'toast ' + type }, text);
  $('#toasts').append(t); setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = 0; setTimeout(() => t.remove(), 400); }, 3800);
}
export function modal(content, { wide = false, onClose } = {}) {
  const bg = h('div', { class: 'modalbg' }); const box = h('div', { class: 'modal' + (wide ? ' wide' : '') });
  const close = () => { bg.remove(); onClose && onClose(); };
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  box.append(content); bg.append(box); document.body.append(bg);
  return { close, box };
}
export function countUp(el, to, ms = 600) {
  const from = Number(el.dataset.v || 0); el.dataset.v = to; const t0 = performance.now();
  const step = t => { const k = Math.min(1, (t - t0) / ms); el.textContent = Math.round(from + (to - from) * k); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
export function avatar(party, size = 54) {
  const ini = party.leader.name.split(' ').map(w => w[0]).slice(0, 2).join('');
  return h('div', { class: 'avatar', style: { background: `linear-gradient(135deg,${party.color},#222a55)`, width: size + 'px', height: size + 'px', fontSize: size * 0.35 + 'px' } }, ini);
}
export function confetti(ms = 5000) {
  const c = h('canvas', { class: 'confetti' }); document.body.append(c);
  const ctx = c.getContext('2d'); const W = c.width = innerWidth, H = c.height = innerHeight;
  const cols = ['#ff9933', '#ffffff', '#1aa34a', '#4f6bff', '#f5c542'];
  const ps = Array.from({ length: 160 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * .6, vx: (Math.random() - .5) * 3, vy: 2 + Math.random() * 4, s: 5 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)], r: Math.random() * 6 }));
  const t0 = performance.now();
  (function f(t) { ctx.clearRect(0, 0, W, H); for (const p of ps) { p.x += p.vx; p.y += p.vy; p.r += .1; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
    if (t - t0 < ms) requestAnimationFrame(f); else c.remove(); })(t0);
}
export function bar(value, max, color) { return h('div', { class: 'bar' }, h('i', { style: { width: Math.max(0, Math.min(100, value / max * 100)) + '%', background: color || 'var(--saffron)' } })); }
