import { h, toast, modal, fmt } from '../ui.js';
import { api } from '../api.js';
import { store, net, logout } from '../main.js';

export function homeScreen(root) {
  const code = h('input', { class: 'codeinput', maxlength: 5, placeholder: 'CODE' });
  const rounds = h('select', null, [6, 8, 10, 12, 15].map(n => h('option', { value: n, selected: n === 10 }, n + ' rounds')));
  const timer = h('select', null, store.meta.timers.map(t => h('option', { value: t, selected: t === 120 }, t ? t + 's per round' : 'No timer')));
  const lb = h('div', null, h('p', { class: 'muted' }, 'Loading…')), hist = h('div', null, h('p', { class: 'muted' }, 'Loading…'));
  async function create(solo) {
    const r = await net.call('room:create', { settings: { rounds: +rounds.value, timer: +timer.value, maxPlayers: 7 } });
    if (!r.ok) return toast(r.error, 'err');
    if (solo) for (let i = 0; i < 3; i++) await net.call('room:addBot', { level: 'normal' });
  }
  async function join() { const r = await net.call('room:join', { code: code.value }); if (!r.ok) toast(r.error, 'err'); }
  code.addEventListener('keydown', e => e.key === 'Enter' && join());
  root.append(
    h('div', { class: 'top' }, h('div', { class: 'logo' }, 'Bharat-', h('b', null, 'Power'), '-', h('span', null, 'Politics')), h('div', { class: 'grow' }),
      h('span', { class: 'pill' }, '👤 ' + store.user.displayName), h('button', { class: 'btn sm', onClick: howTo }, 'How to play'), h('button', { class: 'btn sm', onClick: logout }, 'Sign out')),
    h('div', { class: 'home fade' },
      h('div', { class: 'card' }, h('h3', null, '🏛️ Host a new election'), h('p', { class: 'muted small' }, 'Create a private room and share the 5-letter code with friends.'),
        h('label', null, 'Campaign length'), rounds, h('label', null, 'Turn timer'), timer,
        h('div', { class: 'row', style: { marginTop: '14px' } }, h('button', { class: 'btn primary grow', onClick: () => create(false) }, 'Create room'), h('button', { class: 'btn green grow', onClick: () => create(true) }, 'Solo vs 3 AI'))),
      h('div', { class: 'card' }, h('h3', null, '🔑 Join with room code'), h('p', { class: 'muted small' }, 'Enter the code your host shared. Reconnecting after a refresh puts you back in your game automatically.'),
        code, h('button', { class: 'btn primary block', style: { marginTop: '12px' }, onClick: join }, 'Join room')),
      h('div', { class: 'card' }, h('h3', null, '🏆 Leaderboard (ranked games)'), lb, h('p', { class: 'muted tiny' }, 'Ranked = 2+ human players, 6+ rounds, no AFK farming, max ' + 5 + ' ranked games/day.')),
      h('div', { class: 'card' }, h('h3', null, '📜 Your recent elections'), hist)));
  api('/api/leaderboard').then(({ rows }) => {
    lb.replaceChildren(rows.length ? h('table', null, h('thead', null, h('tr', null, ['#', 'Player', 'Pts', 'W', 'Games', 'Avg seats'].map(x => h('th', null, x)))),
      h('tbody', null, rows.map((r, i) => h('tr', null, h('td', null, i + 1), h('td', null, r.name), h('td', null, h('b', null, fmt(r.points))), h('td', null, r.wins), h('td', null, r.games), h('td', null, r.avgSeats))))) : h('p', { class: 'muted' }, 'No ranked games yet — be the first!'));
  }).catch(() => {});
  api('/api/history').then(({ rows }) => {
    hist.replaceChildren(rows.length ? h('table', null, h('thead', null, h('tr', null, ['Room', 'Party', 'Seats', 'Rank', 'Pts'].map(x => h('th', null, x)))),
      h('tbody', null, rows.map(r => h('tr', null, h('td', null, r.code), h('td', null, r.party), h('td', null, r.seats), h('td', null, (r.pm ? '👑 ' : '') + r.rank), h('td', null, r.points))))) : h('p', { class: 'muted' }, 'You have not finished an election yet.'));
  }).catch(() => {});
  return {};
}

export function howTo() {
  const m = modal(h('div', null,
    h('h2', null, 'How to win the race for 272'),
    h('p', null, 'Every round is one campaign week. All players act ', h('b', null, 'simultaneously'), ' with 6 Action Points; the week resolves when everyone ends their turn (or the timer expires). After the final round, polling day decides all 543 seats by first-past-the-post.'),
    h('h4', null, 'Your toolbox'),
    h('ul', null,
      h('li', null, h('b', null, 'Rally'), ' (1 AP, 8 funds, leader energy): momentum in a seat; fades quickly, diminishing returns, spills over to neighbours.'),
      h('li', null, h('b', null, 'Booth workers'), ' (1 AP, 5 funds): permanent local organisation that barely decays.'),
      h('li', null, h('b', null, 'Targeted ads'), ' (1 AP, 10 funds): boost one voter group across a whole state.'),
      h('li', null, h('b', null, 'Polls'), ' (1 AP, 12 funds): accurate seat-by-seat numbers for a state. Free intel is noisy!'),
      h('li', null, h('b', null, 'Fundraise / Rest / Attack'), ': money (watch the donations controversy meter), leader energy, and negative campaigning (can backfire).'),
      h('li', null, h('b', null, 'Manifesto'), ': 6 policy positions. Voter groups reward platforms matching their views, over-promising costs credibility, and flip-flopping after Round 1 hurts you.'),
      h('li', null, h('b', null, 'Budget'), ': if you are the incumbent government you set taxes, deficit and sector spending; the economy moves, approval follows, and voters judge you.'),
      h('li', null, h('b', null, 'Alliances'), ': up to 3 parties; the strongest ally in a seat receives 60% of partners\u2019 votes there. Locked in the last 2 rounds.')),
    h('h4', null, 'Fair play'),
    h('p', { class: 'muted' }, 'The server is authoritative: rivals\u2019 funds, AP and local strength are never sent to your browser. A spending cap per constituency, per-round limits and AFK handling keep games fair. Victory: 272+ seats (alone or as an alliance) forms a majority government; 362+ is a landslide; otherwise the largest bloc leads a hung parliament.'),
    h('button', { class: 'btn primary', onClick: () => m.close() }, 'Got it')), { wide: true });
}
