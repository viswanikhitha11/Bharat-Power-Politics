import { h, toast, modal, avatar, bar } from '../ui.js';
import { store, net, partyMeta } from '../main.js';

const STYLE = { BRD: 'Balanced • national cadre', JCS: 'Balanced • broad coalition', PJD: 'Regional power • heartland', DSM: 'Regional power • South', HKP: 'Niche • farm belt (hard)', LSM: 'Niche • labour & Kerala (hard)', NAP: 'Niche • urban reformers (hard)' };

export function profile(p) {
  const L = p.leader;
  const trait = (n, v) => h('div', { class: 'stat' }, h('span', null, n), bar(v, 10, p.color), h('b', null, v));
  const m = modal(h('div', null,
    h('div', { class: 'row' }, avatar(p, 72), h('div', null, h('h2', { style: { margin: 0 } }, L.name), h('div', { class: 'muted' }, `${L.title} • ${p.name} ${p.symbol}`), h('div', { class: 'muted small' }, `Age ${L.age} • ${L.home}`))),
    h('p', { style: { marginTop: '12px' } }, L.bio), h('p', null, h('i', null, '“' + p.slogan + '”')),
    trait('Charisma', L.charisma), trait('Trust', L.trust), trait('Vision', L.vision), trait('Stamina', L.stamina),
    h('p', { class: 'small muted' }, 'Strongholds: ' + p.home.join(', ') + ' • Style: ' + (STYLE[p.id] || '')),
    h('p', { class: 'tiny muted' }, 'Fictional character. Charisma boosts rallies, Trust lifts leader rating, Vision aids policy, Stamina is leader energy recovery flavour.'),
    h('button', { class: 'btn', onClick: () => m.close() }, 'Close')));
}

export function lobbyScreen(root) {
  const v = store.view, meta = store.meta;
  const me = v.seats.find(s => s.you);
  const setS = patch => net.call('room:settings', { ...v.settings, ...patch }).then(r => !r.ok && toast(r.error, 'err'));
  const sel = (opts, cur, onch) => h('select', { disabled: !v.isHost, onChange: e => onch(e.target.value) }, opts.map(([val, lab]) => h('option', { value: val, selected: String(val) === String(cur) }, lab)));
  const allReady = v.seats.every(s => s.bot || s.host || s.ready);
  root.append(
    h('div', { class: 'top' }, h('div', { class: 'logo' }, 'Bharat-', h('b', null, 'Power'), '-', h('span', null, 'Politics')), h('div', { class: 'grow' }),
      h('button', { class: 'btn sm danger', onClick: () => net.call('room:leave') }, 'Leave room')),
    h('div', { class: 'lobby fade' },
      h('div', { class: 'col' },
        h('div', { class: 'card center' }, h('div', { class: 'muted small' }, 'ROOM CODE — share with friends'), h('div', { class: 'roomcode' }, v.code),
          h('button', { class: 'btn sm', onClick: () => { navigator.clipboard?.writeText(v.code); toast('Code copied', 'ok'); } }, 'Copy code')),
        h('div', { class: 'card' }, h('h3', null, 'Choose your party'),
          h('div', { class: 'pgrid' }, meta.parties.map(p => {
            const holder = v.seats.find(s => s.pid === p.id);
            const mine = holder && holder.you, taken = holder && !holder.you;
            return h('div', { class: 'pcard' + (mine ? ' mine' : '') + (taken ? ' taken' : ''), style: { '--c': p.color }, onClick: async () => { if (taken || mine) return; const r = await net.call('room:party', { pid: p.id }); if (!r.ok) toast(r.error, 'err'); } },
              h('div', { class: 'row between' }, h('span', { class: 'sym' }, p.symbol), h('button', { class: 'btn sm', onClick: e => { e.stopPropagation(); profile(p); } }, 'Leader')),
              h('div', { class: 'nm' }, p.name), h('div', { class: 'muted small' }, p.leader.name), h('div', { class: 'tiny muted' }, STYLE[p.id]),
              holder ? h('div', { class: 'pill', style: { marginTop: '6px' } }, holder.bot ? '🤖 AI' : '👤 ' + holder.name) : h('div', { class: 'tiny', style: { marginTop: '6px', color: p.color } }, 'Available'));
          })))),
      h('div', { class: 'col' },
        h('div', { class: 'card' }, h('h3', null, `Players (${v.seats.length}/${v.settings.maxPlayers})`),
          v.seats.map(s => { const p = partyMeta(s.pid); return h('div', { class: 'seat' }, h('span', { class: 'dot', style: { background: p.color } }), h('div', { class: 'grow' }, h('b', null, s.name), s.host ? ' 👑' : '', h('div', { class: 'tiny muted' }, p.name)),
            h('span', { class: 'pill' }, s.bot ? '🤖 ' + s.bot : s.ready || s.host ? '✅ ready' : '⏳ not ready'), !s.connected && !s.bot ? h('span', { class: 'pill' }, 'offline') : null,
            v.isHost && !s.host ? h('button', { class: 'btn sm danger', onClick: () => net.call('room:remove', { pid: s.pid }) }, '✕') : null); }),
          v.isHost ? h('div', { class: 'row', style: { marginTop: '8px' } }, h('select', { id: 'lvl' }, ['easy', 'normal', 'hard'].map(l => h('option', { value: l, selected: l === 'normal' }, 'AI: ' + l))),
            h('button', { class: 'btn sm', onClick: async () => { const r = await net.call('room:addBot', { level: document.getElementById('lvl').value }); if (!r.ok) toast(r.error, 'err'); } }, '+ Add AI party')) : null),
        h('div', { class: 'card' }, h('h3', null, 'Game settings'), !v.isHost ? h('p', { class: 'muted small' }, 'Only the host can change settings.') : null,
          h('label', null, 'Rounds (campaign weeks)'), sel(Array.from({ length: 17 }, (_, i) => [i + 4, i + 4]), v.settings.rounds, x => setS({ rounds: +x })),
          h('label', null, 'Turn timer'), sel(meta.timers.map(t => [t, t ? t + ' seconds' : 'No timer']), v.settings.timer, x => setS({ timer: +x })),
          h('label', null, 'Max players'), sel([2, 3, 4, 5, 6, 7].map(n => [n, n]), v.settings.maxPlayers, x => setS({ maxPlayers: +x })),
          h('label', null, 'Government at start'), sel([['random', 'Random incumbent'], ['none', 'No incumbent (open election)']], v.settings.incumbent, x => setS({ incumbent: x }))),
        v.isHost ? h('button', { class: 'btn primary block', disabled: v.seats.length < 2 || !allReady, onClick: async () => { const r = await net.call('room:start'); if (!r.ok) toast(r.error, 'err'); } }, v.seats.length < 2 ? 'Add an AI party or wait for a player' : allReady ? '🚀 Start the campaign' : 'Waiting for players to ready up…')
          : h('button', { class: 'btn ' + (me.ready ? '' : 'green') + ' block', onClick: () => net.call('room:ready', { ready: !me.ready }) }, me.ready ? 'Not ready' : "I'm ready ✔"),
        h('p', { class: 'tiny muted' }, v.seats.filter(s => !s.bot).length >= 2 ? 'Ranked game: counts for the leaderboard (needs 6+ rounds).' : 'Only one human: practice game (not ranked).'))));
  return {};
}
