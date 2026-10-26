import { h, clear, put, toast, modal, fmt, pct, bar, avatar } from '../ui.js';
import { createMap, loadGeo, createGeoMap } from '../map.js';
import { store, net, action, partyMeta, listeners, render } from '../main.js';
import { profile } from './lobby.js';
import { howTo } from './home.js';

const TABS = [['seat', '📍 Seat'], ['party', '🧑‍💼 Party'], ['manifesto', '📜 Manifesto'], ['nation', '📊 Nation'], ['parties', '🤝 Parties'], ['feed', '📰 Feed']];
const GROUPCOL = '#7aa2ff';
const ICON = { event: '⚡', poll: '📈', scandal: '💥', attack: '🗡️', alliance: '🤝', rally: '📣', policy: '📜', budget: '💰', system: '🏛️' };

export function createGameScreen() {
  const ui = store.ui, meta = store.meta, map = store.map;
  const cById = Object.fromEntries(map.constituencies.map(c => [c.id, c]));
  const stById = Object.fromEntries(map.states.map(s => [s.id, s]));
  const el = h('div', { class: 'game' });
  const top = h('div', { class: 'gtop' });
  const mapWrap = h('div', { class: 'mapwrap' });
  const geoWrap = h('div', { class: 'mapwrap', style: { display: 'none' } });
  const tools = h('div', { class: 'maptools' });
  const tallyBox = h('div', { class: 'tally' });
  const panel = h('div', { class: 'spanel' });
  const tabsEl = h('div', { class: 'stabs' });
  const endbar = h('div', { class: 'endbar' });
  el.append(top, h('div', { class: 'gmain' },
    h('div', { class: 'card mapcard' }, tools, mapWrap, geoWrap, tallyBox),
    h('div', { class: 'card side' }, tabsEl, panel, endbar)));
  let geoMap = null, geoData = null, showGeo = false, timerEl = null, chatBox = null, lastSig = '';

  const V = () => store.view;
  const fin = () => V().phase === 'finished';
  const colorOf = pid => partyMeta(pid).color;
  const order = () => V().parties.map(p => p.pid);

  const seatMap = createMap(mapWrap, map, {
    onSelect: id => { ui.selected = id; ui.tab = 'seat'; seatMap.select(id); seatMap.highlightState(cById[id].s); renderTabs(); renderPanel(); },
    tooltip: (c, sn) => {
      const L = leadOf(c); const rows = [h('b', null, `${c.n} (${c.id})`), h('div', { class: 'muted' }, sn + ' • ' + Math.round(c.u * 100) + '% urban')];
      if (fin()) { const r = V().results.per[c.i]; rows.push(h('div', null, '🏆 ' + partyMeta(r.w).short + ' by ' + (r.m * 100).toFixed(1) + ' pts')); }
      else if (L) rows.push(h('div', null, `${L.q ? 'Poll' : 'Rough est.'}: ${partyMeta(order()[L.a]).short} +${(L.margin * 100).toFixed(0)}`));
      return rows;
    },
  });
  loadGeo(map.states).then(g => { if (!g) return; geoData = g; geoMap = createGeoMap(geoWrap, g, { onState: sid => { ui.selected = map.constituencies.find(c => c.s === sid).id; ui.tab = 'seat'; showGeo = false; draw(); } }); drawTools(); paintGeo(); });

  function leadOf(c) {
    const it = store.intel[c.id]; if (!it) return null; const sh = it.sh; let a = 0, b = -1;
    for (let i = 1; i < sh.length; i++) { if (sh[i] > sh[a]) { b = a; a = i; } else if (b < 0 || sh[i] > sh[b]) b = i; }
    return { a, b, margin: b >= 0 ? sh[a] - sh[b] : sh[a], q: it.q, r: it.r };
  }
  const gradient = t => `hsl(${220 - 170 * t}, 70%, ${28 + 30 * t}%)`;
  function paint() {
    const v = V(), me = v.me, mode = fin() ? 'result' : ui.mapMode;
    seatMap.paint(c => {
      if (mode === 'result') { const r = v.results.per[c.i]; return { fill: colorOf(r.w), opacity: 0.45 + Math.min(0.55, r.m * 3) }; }
      if (mode === 'lead' || mode === 'margin') {
        const L = leadOf(c); if (!L) return { fill: '#2a3158', opacity: .6 };
        if (mode === 'margin') return { fill: gradient(Math.max(0, 1 - L.margin * 6)), opacity: 1 };
        return { fill: colorOf(order()[L.a]), opacity: (L.q ? 0.55 : 0.4) + Math.min(0.45, L.margin * 2.5) };
      }
      if (mode === 'org') { const l = me?.local[c.id]; return { fill: l ? gradient(l.o) : '#2a3158', opacity: l ? 1 : .45 }; }
      if (mode === 'mom') { const l = me?.local[c.id]; return { fill: l ? gradient(Math.min(1, l.m)) : '#2a3158', opacity: l ? 1 : .45 }; }
      if (mode === 'urban') return { fill: gradient(c.u), opacity: 1 };
      if (mode.startsWith('g:')) { const k = meta.groups.findIndex(g => g.id === mode.slice(2)); return { fill: gradient(Math.min(1, c.g[k] * 2.2)), opacity: 1 }; }
    });
    seatMap.select(ui.selected); seatMap.highlightState(ui.selected ? cById[ui.selected].s : null);
  }
  function paintGeo() {
    if (!geoMap) return; const v = V();
    const lead = {}; for (const c of map.constituencies) { let a = -1; if (fin()) a = order().indexOf(v.results.per[c.i].w); else { const L = leadOf(c); a = L ? L.a : -1; } if (a >= 0) { (lead[c.s] = lead[c.s] || {}); lead[c.s][a] = (lead[c.s][a] || 0) + 1; } }
    geoMap.paintState(sid => { const l = lead[sid]; if (!l) return {}; const a = Object.keys(l).sort((x, y) => l[y] - l[x])[0]; return { fill: colorOf(order()[a]), opacity: .85 }; });
  }
  function drawTools() {
    const sel = h('select', { onChange: e => { ui.mapMode = e.target.value; paint(); } }, ...[['lead', 'Leading party (poll)'], ['margin', 'Battleground (margin)'], ['org', 'My organisation'], ['mom', 'My momentum'], ['urban', 'Urban share'], ...meta.groups.map(g => ['g:' + g.id, g.icon + ' ' + g.name])].map(([k, l]) => h('option', { value: k, selected: ui.mapMode === k }, l)));
    put(tools, fin() ? h('span', { class: 'pill' }, '🗳️ Final results') : sel,
      h('button', { class: 'btn sm', onClick: () => seatMap.zoom(0.7) }, '＋'), h('button', { class: 'btn sm', onClick: () => seatMap.zoom(1.4) }, '－'), h('button', { class: 'btn sm', onClick: () => seatMap.reset() }, 'Reset'),
      geoData ? h('button', { class: 'btn sm', onClick: () => { showGeo = !showGeo; mapWrap.style.display = showGeo ? 'none' : ''; geoWrap.style.display = showGeo ? '' : 'none'; } }, '🌐 Geo/Cartogram') : null,
      h('span', { class: 'muted tiny' }, 'Scroll to zoom • drag to pan • each square = 1 constituency'));
  }
  function tally() {
    const v = V(), n = v.parties.length, counts = new Array(n).fill(0); let unk = 0;
    for (const c of map.constituencies) { if (fin()) counts[order().indexOf(v.results.per[c.i].w)]++; else { const L = leadOf(c); L ? counts[L.a]++ : unk++; } }
    put(tallyBox, h('div', { class: 'row between small' }, h('b', null, fin() ? 'Final seat tally' : 'Projected seats (your noisy intel)'), h('span', { class: 'muted' }, `Majority: ${meta.majority}`)),
      h('div', { class: 'stack' }, counts.map((c, i) => h('i', { style: { width: c / 543 * 100 + '%', background: colorOf(order()[i]) }, title: partyMeta(order()[i]).name + ': ' + c })), h('div', { class: 'mid' })),
      h('div', { class: 'legend' }, v.parties.map((p, i) => h('span', null, h('span', { class: 'dot', style: { background: colorOf(p.pid) } }), ' ', partyMeta(p.pid).short, ' ', h('b', null, counts[i])))));
  }
  const me = () => V().me;
  function topbar() {
    const v = V(), m = me(), inc = v.incumbent;
    timerEl = h('b', null, '—');
    put(top, h('div', { class: 'logo' }, 'B', h('b', null, 'P'), 'P'),
      h('div', { class: 'chip' }, h('small', null, fin() ? 'Result' : 'Round'), h('b', null, fin() ? 'Final' : `${v.round}/${v.totalRounds}`)),
      !fin() ? h('div', { class: 'chip' }, h('small', null, 'Time left'), timerEl) : null,
      m ? [h('div', { class: 'chip', style: { borderColor: colorOf(m.pid) } }, h('small', null, 'Party'), h('b', { style: { color: colorOf(m.pid) } }, partyMeta(m.pid).short + (inc === m.pid ? ' 🏛️' : ''))),
        h('div', { class: 'chip' }, h('small', null, 'Funds'), h('b', null, '₹' + m.funds + ' cr')),
        h('div', { class: 'chip' }, h('small', null, 'Action points'), h('div', { class: 'pips' }, Array.from({ length: m.apMax }, (_, i) => h('i', { class: i < m.ap ? 'on' : '' })))),
        h('div', { class: 'chip' }, h('small', null, 'Leader energy'), h('b', null, m.energy + '%')),
        h('div', { class: 'chip' }, h('small', null, 'Govt approval'), h('b', { class: v.approval.national >= 50 ? 'up' : 'down' }, v.approval.national.toFixed(0) + '%'))] : null,
      h('div', { class: 'grow' }),
      h('div', { class: 'row' }, v.parties.map(p => h('span', { class: 'pill', title: p.name, style: { borderColor: p.ready ? 'var(--green)' : 'var(--line)' } }, h('span', { class: 'dot', style: { background: colorOf(p.pid) } }), partyMeta(p.pid).short, p.bot ? '🤖' : p.autopilot ? '💤' : p.ready ? '✔' : '…'))),
      h('button', { class: 'btn sm', onClick: howTo }, '?'), h('button', { class: 'btn sm', onClick: () => net.call('room:leave') }, 'Leave'));
    tickTimer();
  }
  function tickTimer() {
    if (!timerEl) return; const v = V(); if (!v.deadline) { timerEl.textContent = '∞'; return; }
    const s = Math.max(0, Math.ceil((v.deadline - (Date.now() + store.serverOffset)) / 1000)); timerEl.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); timerEl.style.color = s <= 15 ? 'var(--red)' : '';
  }
  const timerId = setInterval(tickTimer, 500);

  // ---------- panels ----------
  function renderTabs() {
    const inc = me()?.proposalsIn?.length || 0;
    put(tabsEl, TABS.map(([k, l]) => h('button', { class: ui.tab === k ? 'on' : '', onClick: () => { ui.tab = k; renderTabs(); renderPanel(); } }, l, k === 'parties' && inc ? h('span', { class: 'badge' }, inc) : null)));
  }
  function renderPanel() { chatBox = null; const t = { seat: seatTab, party: partyTab, manifesto: manifestoTab, nation: nationTab, parties: partiesTab, feed: feedTab }[ui.tab]; const top = panel.scrollTop; put(panel, t()); panel.scrollTop = top; }
  function endBar() {
    const v = V(), m = me(); clear(endbar);
    if (fin()) { endbar.append(h('button', { class: 'btn primary grow', onClick: () => { ui.electionSeen = null; render(); } }, '🌙 Replay election night'), h('button', { class: 'btn grow', onClick: () => net.call('room:leave') }, 'Back to home')); return; }
    if (!m) return;
    const waiting = v.parties.filter(p => !p.ready).map(p => partyMeta(p.pid).short);
    endbar.append(h('button', { class: 'btn ' + (m.ready ? '' : 'primary') + ' grow', disabled: m.ready, onClick: async () => { await action({ type: 'endTurn' }, true); } }, m.ready ? `⏳ Waiting for ${waiting.join(', ')}` : m.ap > 0 ? `End turn (${m.ap} AP unused)` : 'End turn ✔'));
  }

  function seatTab() {
    const v = V(), m = me(), id = ui.selected;
    if (!id) return h('div', null, h('h3', null, 'Pick a constituency'), h('p', { class: 'muted' }, 'Click any square on the map. Rally, deploy booth workers, buy ads and commission polls from here. Use the Battleground map view to find marginal seats.'));
    const c = cById[id], st = stById[c.s], L = leadOf(c), it = store.intel[id], loc = m?.local[id];
    const body = [h('div', { class: 'row between' }, h('div', null, h('h3', { style: { marginBottom: 0 } }, c.n), h('div', { class: 'muted small' }, `${id} • ${st.name} • ${(c.e).toFixed(1)} lakh voters • ${(c.u * 100).toFixed(0)}% urban`)), h('button', { class: 'btn sm', onClick: () => seatMap.focusState(c.s) }, 'Zoom state'))];
    body.push(h('h4', { style: { marginTop: '12px' } }, 'Voter groups here'), meta.groups.map((g, k) => h('div', { class: 'group' }, h('span', null, g.icon), h('span', null, g.name), bar(c.g[k], 0.45, GROUPCOL), h('b', null, (c.g[k] * 100).toFixed(0) + '%'))));
    if (fin()) {
      const r = v.results.per[c.i]; body.push(h('h4', { style: { marginTop: '12px' } }, `Result: ${partyMeta(r.w).name} wins by ${(r.m * 100).toFixed(1)} pts • turnout ${(r.t * 100).toFixed(0)}%`));
      const rows = r.sh.map((s, i) => [order()[i], s]).sort((a, b) => b[1] - a[1]); body.push(rows.map(([pid, s]) => h('div', { class: 'group' }, h('span', { class: 'dot', style: { background: colorOf(pid) } }), h('span', null, partyMeta(pid).short), bar(s, 0.6, colorOf(pid)), h('b', null, (s * 100).toFixed(0) + '%'))));
      return h('div', null, body);
    }
    body.push(h('h4', { style: { marginTop: '12px' } }, it ? (it.q ? `Constituency poll (round ${it.r}${v.round - it.r ? ', ' + (v.round - it.r) + ' old' : ''})` : 'Rough estimate (±high noise) — commission a poll for precision') : 'No intel yet'));
    if (it) body.push(it.sh.map((s, i) => [order()[i], s]).sort((a, b) => b[1] - a[1]).map(([pid, s]) => h('div', { class: 'group' }, h('span', { class: 'dot', style: { background: colorOf(pid) } }), h('span', null, partyMeta(pid).short), bar(s, 0.6, colorOf(pid)), h('b', null, (s * 100).toFixed(0) + '%'))));
    if (m) {
      const cost = meta.cost, cap = meta.limit.seatSpendCap, rl = m.counters.rallies[id] || 0, spent = loc?.s || 0;
      body.push(h('h4', { style: { marginTop: '12px' } }, 'Your campaign here'), h('div', { class: 'small muted' }, `Organisation ${(100 * (loc?.o || 0)).toFixed(0)}% • Momentum ${(loc?.m || 0).toFixed(2)} • Spent ₹${spent}/${cap} cr (Election Commission cap)`));
      const btn = (label, cost, type, extra, dis) => h('div', { class: 'act' }, h('div', null, h('b', null, label), h('div', { class: 'cost' }, cost)), h('button', { class: 'btn sm primary', disabled: m.ready || dis, onClick: () => action({ type, ...extra }) }, 'Do it'));
      body.push(btn('📣 Hold rally', `1 AP • ₹${cost.rally.funds} cr • ${cost.rally.energy} energy • ${rl}/${meta.limit.rallyPerSeatPerRound} this round`, 'rally', { cid: id }, m.ap < 1 || m.funds < cost.rally.funds || m.energy < cost.rally.energy || rl >= meta.limit.rallyPerSeatPerRound),
        btn('🏘️ Booth workers', `1 AP • ₹${cost.booth.funds} cr • lasting organisation`, 'booth', { cid: id }, m.ap < 1 || m.funds < cost.booth.funds));
      const gsel = h('select', { style: { width: 'auto' } }, meta.groups.map(g => h('option', { value: g.id }, g.icon + ' ' + g.name)));
      body.push(h('h4', { style: { marginTop: '12px' } }, `State-wide: ${st.name}`),
        h('div', { class: 'act' }, h('div', null, h('b', null, '📺 Targeted ad campaign'), h('div', { class: 'cost' }, `1 AP • ₹${cost.ad.funds} cr • boosts a voter group in all ${st.seats} seats`), gsel),
          h('button', { class: 'btn sm primary', disabled: m.ready || m.ap < 1 || m.funds < cost.ad.funds, onClick: () => action({ type: 'ad', sid: c.s, group: gsel.value }) }, 'Run')),
        btn('📊 Commission state poll', `1 AP • ₹${cost.poll.funds} cr • accurate numbers for all ${st.seats} seats`, 'poll', { sid: c.s }, m.ap < 1 || m.funds < cost.poll.funds));
    }
    return h('div', null, body);
  }
  function partyTab() {
    const m = me(); if (!m) return h('p', { class: 'muted' }, 'Spectating.'); const p = partyMeta(m.pid), L = p.leader, cost = meta.cost;
    const stat = (n, val, max, col) => h('div', { class: 'stat' }, h('span', null, n), bar(val, max, col), h('b', null, typeof val === 'number' ? Math.round(val) : val));
    return h('div', null, h('div', { class: 'row' }, avatar(p, 64), h('div', null, h('h3', { style: { margin: 0 } }, L.name), h('div', { class: 'muted small' }, `${L.title}, ${p.name}`), h('button', { class: 'btn sm', onClick: () => profile(p) }, 'Full profile'))),
      h('div', { style: { marginTop: '10px' } }, stat('Energy', m.energy, 100, '#4cd27b'), stat('Leader rating', m.popularity * 100, 100, p.color), stat('Credibility', m.credibility * 100, 100, '#7aa2ff'), stat('Donor heat', m.controversy * 100, 100, '#ff7b80')),
      h('p', { class: 'tiny muted' }, 'Donor heat rises with fundraising; at 100% a scandal hits your rating. Credibility falls when you flip-flop or over-promise.'),
      h('div', { class: 'act' }, h('div', null, h('b', null, '💰 Fundraise'), h('div', { class: 'cost' }, `1 AP • about +₹${Math.round(26 * (1 - 0.4 * m.controversy))} cr • ${m.counters.fundraise}/${meta.limit.fundraisePerRound} this round`)), h('button', { class: 'btn sm primary', disabled: m.ready || m.ap < 1 || m.counters.fundraise >= meta.limit.fundraisePerRound, onClick: () => action({ type: 'fundraise' }) }, 'Do it')),
      h('div', { class: 'act' }, h('div', null, h('b', null, '🧘 Rest leader'), h('div', { class: 'cost' }, '1 AP • +30 energy')), h('button', { class: 'btn sm primary', disabled: m.ready || m.ap < 1, onClick: () => action({ type: 'rest' }) }, 'Do it')),
      h('h4', null, 'Your campaign so far'), h('div', { class: 'kpi' }, [['Rallies', m.stats.rallies], ['Booth drives', m.stats.booths], ['Ad campaigns', m.stats.ads], ['Polls', m.stats.polls], ['Attacks', m.stats.attacks], ['Funds spent', '₹' + m.stats.spent]].map(([k, val]) => h('div', null, h('b', null, val), h('small', null, k)))));
  }
  const alignFn = (man, k) => { let num = 0, den = 0; meta.issues.forEach((is, i) => { const w = meta.weight[k][i]; num += w * Math.abs((man[is.id] ?? 0) - meta.pref[k][i]); den += w; }); return 1 - num / (den * 4); };
  function manifestoTab() {
    const m = me(), v = V(); const mine = v.parties.find(p => p.pid === m?.pid); if (!mine) return h('p', { class: 'muted' }, 'Spectating.');
    let cost = 0; for (const is of meta.issues) { const s = mine.manifesto[is.id]; cost += is.id === 'tax' ? Math.max(0, -s) : Math.max(0, s); }
    const free = v.round === 1, left = meta.limit.policyChangesPerRound - m.counters.policy;
    return h('div', null, h('p', { class: 'small muted' }, free ? 'Round 1: reshape your platform for free.' : `After Round 1 each change costs 5% credibility. Changes left this round: ${Math.max(0, left)}.`),
      h('div', { class: 'row between small' }, h('span', null, 'Fiscal promise load: ', h('b', { class: cost > 6 ? 'down' : '' }, cost + '/12')), h('span', null, 'Credibility: ', h('b', null, Math.round(mine.credibility * 100) + '%'))),
      meta.issues.map(is => h('div', { style: { margin: '10px 0' } }, h('div', { class: 'row between small' }, h('b', null, is.name), h('span', { class: 'muted tiny' }, `${is.lo} ⟷ ${is.hi}`)),
        h('div', { class: 'seg' }, [-2, -1, 0, 1, 2].map(s => h('button', { class: mine.manifesto[is.id] === s ? 'on' : '', disabled: m.ready, onClick: async () => { await action({ type: 'policy', issue: is.id, stance: s }); } }, s > 0 ? '+' + s : s))))),
      h('h4', null, 'How voter groups see your platform'),
      meta.groups.map((g, k) => { const a = alignFn(mine.manifesto, k); return h('div', { class: 'group' }, h('span', null, g.icon), h('span', null, g.name), bar(a, 1, a > .65 ? '#4cd27b' : a > .5 ? '#f5c542' : '#ff7b80'), h('b', null, Math.round(a * 100) + '%')); }));
  }
  function nationTab() {
    const v = V(), e = v.economy, b = v.budget, m = me(), inc = v.incumbent === m?.pid;
    const k = (n, val, suf, good) => h('div', null, h('b', { class: good === undefined ? '' : good ? 'up' : 'down' }, val.toFixed(1) + suf), h('small', null, n));
    const out = [h('p', { class: 'small' }, v.incumbent ? ['Government: ', h('b', { style: { color: colorOf(v.incumbent) } }, partyMeta(v.incumbent).name), `. Approval ${v.approval.national.toFixed(0)}%.`] : 'No incumbent government — approval has no effect.'),
      h('div', { class: 'kpi' }, k('GDP growth', e.gdp, '%', e.gdp >= 6.5), k('Inflation', e.infl, '%', e.infl <= 5.5), k('Unemployment', e.unemp, '%', e.unemp <= 7), k('Public debt', e.debt, '% GDP', e.debt < 75),
        k('Health', e.health, '', e.health >= 50), k('Education', e.education, '', e.education >= 50), k('Infrastructure', e.infra, '', e.infra >= 50), k('Welfare', e.welfare, '', e.welfare >= 50), k('Agriculture', e.agri, '', e.agri >= 50), k('Security', e.security, '', e.security >= 50)),
      h('h4', { style: { marginTop: '12px' } }, 'Approval by voter group'), meta.groups.map(g => h('div', { class: 'group' }, h('span', null, g.icon), h('span', null, g.name), bar(v.approval.groups[g.id], 100, v.approval.groups[g.id] >= 50 ? '#4cd27b' : '#ff7b80'), h('b', null, Math.round(v.approval.groups[g.id]))))];
    out.push(h('h4', { style: { marginTop: '12px' } }, inc ? '🏛️ Union Budget (you govern)' : 'Union Budget (set by the government)'));
    if (!ui.budget || ui.budgetRound !== v.round) { ui.budget = { ...b }; ui.budgetRound = v.round; }
    const d = ui.budget, lim = meta.budgetLimits, secs = [['health', 'Health'], ['education', 'Education'], ['infra', 'Infrastructure'], ['welfare', 'Welfare'], ['agri', 'Agriculture'], ['defence', 'Defence & Security']];
    const sumEl = h('b'), submit = h('button', { class: 'btn primary block', disabled: m?.ready || !inc || m.counters.budget }, 'Pass budget');
    const upd = () => { const s = secs.reduce((a, [kk]) => a + d[kk], 0); sumEl.textContent = s.toFixed(0) + '%'; sumEl.className = Math.abs(s - 100) < .5 ? 'up' : 'down'; submit.disabled = !inc || m.ready || m.counters.budget || Math.abs(s - 100) > .5; };
    const slider = (key, label, min, max, step, cur, unit) => { const val = h('b', null, d[key] + unit); return h('div', { style: { margin: '6px 0' } }, h('div', { class: 'row between small' }, h('span', null, label), val), h('input', { type: 'range', min: Math.max(min, cur - (key === 'tax' ? lim.taxStep : key === 'deficit' ? lim.defStep : lim.sectorStep)), max: Math.min(max, cur + (key === 'tax' ? lim.taxStep : key === 'deficit' ? lim.defStep : lim.sectorStep)), step, value: d[key], disabled: !inc || m.ready, onInput: ev => { d[key] = +ev.target.value; val.textContent = d[key] + unit; upd(); } })); };
    out.push(secs.map(([kk, l]) => slider(kk, l, lim.sectorMin, lim.sectorMax, 1, b[kk], '%')), slider('tax', 'Tax rate', lim.taxMin, lim.taxMax, 1, b.tax, '%'), slider('deficit', 'Deficit target (% GDP)', lim.defMin, lim.defMax, 0.5, b.deficit, '%'),
      h('div', { class: 'row between small' }, h('span', null, 'Allocation total (must be 100%)'), sumEl), submit,
      h('p', { class: 'tiny muted' }, inc ? 'Each sector can move ±8 points, tax ±3, deficit ±1 per round. Spending above baseline lifts that sector; a high deficit fuels inflation and debt; high taxes slow growth.' : 'Only the incumbent can change the budget — but voters will judge them on the results.'));
    submit.addEventListener('click', async () => { const r = await action({ type: 'budget', ...d }); if (r.ok) ui.budgetRound = -1; });
    upd(); return h('div', null, out);
  }
  function partiesTab() {
    const v = V(), m = me(), out = [];
    for (const pid of m?.proposalsIn || []) out.push(h('div', { class: 'prow', style: { borderColor: 'var(--green)' } }, h('div', { class: 'grow' }, h('b', null, partyMeta(pid).name), ' proposes an alliance'), h('button', { class: 'btn sm green', onClick: () => action({ type: 'respond', from: pid, accept: true }) }, 'Accept'), h('button', { class: 'btn sm', onClick: () => action({ type: 'respond', from: pid, accept: false }) }, 'Decline')));
    const myAl = v.alliances.find(a => a.members.includes(m?.pid));
    for (const p of v.parties) {
      const pm = partyMeta(p.pid), al = v.alliances.find(a => a.members.includes(p.pid)), ally = myAl && myAl === al, you = p.pid === m?.pid;
      out.push(h('div', { class: 'prow', style: { borderLeft: `5px solid ${pm.color}` } }, h('div', { onClick: () => profile(pm), style: { cursor: 'pointer' } }, avatar(pm, 42)),
        h('div', { class: 'grow' }, h('b', null, pm.name, v.incumbent === p.pid ? ' 🏛️' : '', you ? ' (you)' : ''), h('div', { class: 'tiny muted' }, `${p.name} • rating ${Math.round(p.popularity * 100)} • credibility ${Math.round(p.credibility * 100)}%`),
          al ? h('span', { class: 'pill' }, '🤝 ' + al.members.map(x => partyMeta(x).short).join(' + ')) : null, p.left ? h('span', { class: 'pill' }, 'left game') : null),
        !you && m && !fin() ? h('div', { class: 'col', style: { gap: '4px' } },
          ally ? h('button', { class: 'btn sm', disabled: m.ready, onClick: () => action({ type: 'breakAlliance' }) }, 'Leave alliance') : h('button', { class: 'btn sm green', disabled: m.ready || m.proposalsOut.includes(p.pid), onClick: () => action({ type: 'propose', target: p.pid }) }, m.proposalsOut.includes(p.pid) ? 'Proposed' : 'Ally'),
          !ally ? h('button', { class: 'btn sm danger', disabled: m.ready || m.ap < 1 || m.funds < meta.cost.attack.funds || m.counters.attack >= 1, title: '1 AP, ₹12 cr, 62% success, may backfire', onClick: () => action({ type: 'attack', target: p.pid }) }, '🗡️ Attack') : null) : null));
    }
    out.push(h('p', { class: 'tiny muted' }, 'Allies cannot attack each other. In each seat the strongest ally gets 60% of partner votes; the alliance forms the government together if it crosses 272. Alliances lock in the last 2 rounds.'));
    return h('div', null, out);
  }
  function feedTab() {
    const v = V();
    const input = h('input', { placeholder: 'Message the room…', maxlength: 240 });
    const send = async () => { const t = input.value.trim(); if (!t) return; input.value = ''; const r = await net.call('chat:send', { text: t }); if (!r.ok && r.error) toast(r.error, 'err'); };
    input.addEventListener('keydown', e => e.key === 'Enter' && send());
    chatBox = h('div', { class: 'chat' }); drawChat();
    return h('div', null, h('h4', null, 'Room chat'), chatBox, h('div', { class: 'row' }, input, h('button', { class: 'btn sm', onClick: send }, 'Send')),
      h('h4', { style: { marginTop: '12px' } }, 'News wire'), [...v.news].reverse().map(n => h('div', { class: 'news ' + n.t }, h('span', { class: 'muted tiny' }, 'R' + n.r + ' '), ICON[n.t] || '•', ' ', n.x)));
  }
  function drawChat() { if (!chatBox) return; put(chatBox, store.chat.length ? store.chat.map(m => h('div', null, h('b', { style: { color: m.pid ? partyMeta(m.pid).color : '' } }, m.name + ': '), m.text)) : h('span', { class: 'muted' }, 'No messages yet.')); chatBox.scrollTop = chatBox.scrollHeight; }
  const chatListener = k => { if (k === 'chat') drawChat(); }; listeners.add(chatListener);

  function draw() { drawTools(); paint(); paintGeo(); }
  function update() {
    const v = V(); topbar(); endBar(); tally(); draw(); renderTabs();
    const sig = v.round + '|' + v.phase + '|' + v.news.length;
    if (ui.tab !== 'feed' || sig !== lastSig || !chatBox) renderPanel();
    lastSig = sig;
  }
  return { el, update, destroy() { clearInterval(timerId); listeners.delete(chatListener); } };
}
