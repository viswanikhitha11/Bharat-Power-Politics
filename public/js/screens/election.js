import { h, clear, put, fmt, bar, avatar, confetti, countUp } from '../ui.js';
import { createMap } from '../map.js';
import { store, net, partyMeta } from '../main.js';

export function createElection({ onExplore }) {
  const v = store.view, R = v.results, map = store.map, meta = store.meta;
  const pids = R.pids, col = pid => partyMeta(pid).color, short = pid => partyMeta(pid).short;
  const cById = Object.fromEntries(map.constituencies.map(c => [c.id, c]));
  const mapWrap = h('div', { class: 'mapwrap', style: { minHeight: '420px' } });
  const rowsBox = h('div'), ticker = h('div', { class: 'ticker' }), controls = h('div', { class: 'row' }), finalBox = h('div');
  const prog = h('div', { class: 'bar' }, h('i', { style: { width: '0%', background: 'var(--saffron)' } }));
  const declared = h('b', null, '0');
  const live = h('span', { class: 'live' }, '● LIVE');
  const el = h('div', { class: 'elect' },
    h('div', { class: 'ehead' }, h('h1', null, '🗳️ ELECTION NIGHT'), live, h('span', { class: 'muted' }, `Room ${v.code} • ${R.totalSeats} constituencies • majority ${R.majority}`), h('div', { class: 'grow' }), controls),
    h('div', { class: 'ebody' }, h('div', { class: 'card' }, mapWrap, h('div', { class: 'row between small', style: { marginTop: '8px' } }, h('span', null, 'Declared: ', declared, ' / 543'), h('span', { class: 'muted' }, 'Click a declared seat for details')), prog),
      h('div', { class: 'col' }, h('div', { class: 'card' }, h('h3', null, 'Seat tally'), rowsBox), h('div', { class: 'card' }, h('h3', null, 'Results desk'), ticker), finalBox)));
  const seats = Object.fromEntries(pids.map(p => [p, 0]));
  let idx = 0, speed = 1, timer = null, majorityShown = false, ended = false;
  const done = new Set();
  const emap = createMap(mapWrap, map, {
    onSelect: id => { if (!done.has(id)) return; const r = R.per[cById[id].i]; ticker.prepend(h('div', { style: { color: col(r.w) } }, `🔎 ${cById[id].n}: ` + r.sh.map((s, i) => `${short(pids[i])} ${(s * 100).toFixed(0)}%`).join(' • '))); emap.select(id); },
    tooltip: c => { const r = done.has(c.id) ? R.per[c.i] : null; return [h('b', null, c.n), h('div', { class: 'muted' }, c.s), h('div', null, r ? `🏆 ${short(r.w)} by ${(r.m * 100).toFixed(1)} pts` : 'Counting…')]; },
  });
  emap.paint(() => ({ fill: '#222a50', opacity: .55 }));
  const blocOf = pid => R.blocs.find(b => b.members.includes(pid));
  function drawRows() {
    const arr = pids.slice().sort((a, b) => seats[b] - seats[a]);
    put(rowsBox, arr.map(pid => h('div', { class: 'trow', style: { borderLeft: `5px solid ${col(pid)}` } }, h('span', { style: { fontSize: '22px' } }, partyMeta(pid).symbol),
      h('div', null, h('b', null, partyMeta(pid).name), v.parties.find(p => p.pid === pid)?.you ? h('span', { class: 'pill', style: { marginLeft: '6px' } }, 'YOU') : null, bar(seats[pid], 200, col(pid))), h('div', { class: 'big' }, seats[pid]))));
    const alliances = R.blocs.filter(b => b.members.length > 1);
    for (const b of alliances) { const t = b.members.reduce((a, p) => a + seats[p], 0); rowsBox.append(h('div', { class: 'small', style: { padding: '6px 4px' } }, '🤝 Alliance ' + b.members.map(short).join(' + ') + ': ', h('b', null, t), t >= R.majority ? ' ✅ majority' : '')); }
    rowsBox.append(h('div', { class: 'stack', style: { marginTop: '8px' } }, arr.map(pid => h('i', { style: { width: seats[pid] / 543 * 100 + '%', background: col(pid) } })), h('div', { class: 'mid' })));
  }
  function banner(text) { const b = h('div', { class: 'banner' }, text); document.body.append(b); setTimeout(() => b.remove(), 3500); }
  function declare(id) {
    const c = cById[id], r = R.per[c.i]; done.add(id); seats[r.w]++;
    emap.paint2 ? 0 : 0; const cell = emap.cells[id]; cell.setAttribute('fill', col(r.w)); cell.style.opacity = 0.6 + Math.min(.4, r.m * 3); emap.flash(id);
    ticker.prepend(h('div', { style: { color: col(r.w) } }, `✔ ${c.n} (${c.s}): ${short(r.w)} wins by ${(r.m * 100).toFixed(1)} pts`)); while (ticker.childNodes.length > 40) ticker.lastChild.remove();
    if (!majorityShown) for (const b of R.blocs) { const t = b.members.reduce((a, p) => a + seats[p], 0); if (t >= R.majority) { majorityShown = true; banner(`🎉 ${b.members.map(short).join(' + ')} CROSS${b.members.length > 1 ? '' : 'ES'} THE MAJORITY MARK!`); } }
  }
  function step() {
    const n = Math.max(1, Math.round(4 * speed));
    for (let i = 0; i < n && idx < R.order.length; i++) declare(R.order[idx++]);
    declared.textContent = idx; prog.firstChild.style.width = idx / 543 * 100 + '%'; drawRows();
    if (idx >= R.order.length) finish();
  }
  function finish() {
    if (ended) return; ended = true; clearInterval(timer); live.textContent = 'FINAL'; live.style.animation = 'none';
    while (idx < R.order.length) declare(R.order[idx++]); declared.textContent = 543; prog.firstChild.style.width = '100%'; drawRows();
    const gov = R.gov, pm = partyMeta(gov.pm), mine = v.me?.pid, mineIn = mine && gov.members.includes(mine);
    clear(controls);
    put(finalBox, h('div', { class: 'winner' }, h('div', { class: 'row' }, avatar(pm, 64), h('div', null,
      h('div', { class: 'muted small' }, gov.type === 'majority' ? (gov.landslide ? '🔥 LANDSLIDE — TWO-THIRDS MAJORITY' : '🏛️ MAJORITY GOVERNMENT') : '⚖️ HUNG PARLIAMENT — LARGEST BLOC'),
      h('h2', { style: { margin: 0 } }, `${pm.leader.name} is the next Prime Minister`), h('div', null, `${pm.name} ${pm.symbol}` + (gov.members.length > 1 ? ' with ' + gov.members.filter(m => m !== gov.pm).map(short).join(', ') : ''), ` — ${gov.seats} seats`))),
      mine ? h('p', null, mine === gov.pm ? '👑 You won the election!' : mineIn ? '🤝 You are in government as a coalition partner.' : `You finished #${R.parties.find(p => p.pid === mine).rank} with ${R.parties.find(p => p.pid === mine).seats} seats.`) : null),
      h('div', { class: 'card' }, h('table', null, h('thead', null, h('tr', null, ['#', 'Party', 'Seats', 'Vote share', ''].map(x => h('th', null, x)))),
        h('tbody', null, R.parties.map(p => h('tr', { style: p.pid === mine ? { background: 'rgba(255,153,51,.15)' } : {} }, h('td', null, p.rank), h('td', null, h('span', { class: 'dot', style: { background: col(p.pid) } }), ' ', partyMeta(p.pid).name), h('td', null, h('b', null, p.seats)), h('td', null, (p.voteShare * 100).toFixed(1) + '%'), h('td', null, p.pm ? '👑' : p.inGov ? '🤝' : '')))))),
      h('div', { class: 'row' }, h('button', { class: 'btn primary grow', onClick: onExplore }, '🗺️ Explore results'), h('button', { class: 'btn grow', onClick: () => net.call('room:leave') }, 'Back to home')));
    if (mineIn) confetti();
  }
  function drawControls() {
    put(controls, h('span', { class: 'muted small' }, 'Speed'), ...[1, 3, 8].map(s => h('button', { class: 'btn sm' + (speed === s ? ' primary' : ''), onClick: () => { speed = s; drawControls(); } }, s + '×')), h('button', { class: 'btn sm', onClick: finish }, 'Skip ⏭'));
  }
  return { el, start() { drawRows(); drawControls(); timer = setInterval(step, 120); }, destroy() { clearInterval(timer); } };
}
