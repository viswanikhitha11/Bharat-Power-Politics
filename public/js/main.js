import { h, clear, toast, $ } from './ui.js';
import { api, getToken, setToken } from './api.js';
import { authScreen } from './screens/auth.js';
import { homeScreen } from './screens/home.js';
import { lobbyScreen } from './screens/lobby.js';
import { createGameScreen } from './screens/game.js';
import { createElection } from './screens/election.js';

export const store = { user: null, meta: null, map: null, view: null, intel: {}, chat: [], ui: { tab: 'seat', selected: null, mapMode: 'lead', budget: null, electionSeen: null }, serverOffset: 0 };
let socket = null, current = null; // current = {kind, inst}
const app = $('#app');
export const partyMeta = pid => store.meta.parties.find(p => p.id === pid);
export const listeners = new Set();

export const net = {
  call(ev, payload) { return new Promise(res => { if (!socket || !socket.connected) return res({ ok: false, error: 'Not connected to server.' }); socket.timeout(8000).emit(ev, payload || {}, (err, r) => res(err ? { ok: false, error: 'Server timeout.' } : r)); }); },
};
export async function action(payload, quiet) {
  const r = await net.call('game:action', payload);
  if (!quiet) toast(r.ok ? (r.msg || 'Done') : r.error, r.ok ? 'ok' : 'err');
  return r;
}
export function logout() { setToken(null); if (socket) socket.disconnect(); socket = null; store.user = null; store.view = null; render(); }

function connect() {
  if (socket) socket.disconnect();
  socket = io({ auth: { token: getToken() }, reconnection: true });
  socket.on('connect_error', e => { if (String(e.message).includes('unauthorized')) logout(); });
  socket.on('state', v => {
    if (v && v.serverTime) store.serverOffset = v.serverTime - Date.now();
    if (v && v.intel) store.intel = v.intel;
    if (!v || v.phase === 'lobby') { store.intel = {}; }
    const prevRound = store.view?.round; store.view = v; render();
    if (v && v.phase === 'playing' && prevRound && v.round > prevRound) toast(`Round ${v.round} begins`, 'warn');
  });
  socket.on('toast', t => toast(t.text, t.type === 'warn' ? 'warn' : ''));
  socket.on('chat', m => { store.chat.push(m); if (store.chat.length > 100) store.chat.shift(); listeners.forEach(f => f('chat')); });
  socket.on('disconnect', () => toast('Disconnected — reconnecting…', 'warn'));
  socket.io.on('reconnect', () => toast('Reconnected', 'ok'));
}

export function render() {
  const v = store.view;
  let kind;
  if (!store.user) kind = 'auth';
  else if (!v) kind = 'home';
  else if (v.phase === 'lobby') kind = 'lobby';
  else if (v.phase === 'finished' && store.ui.electionSeen !== v.code) kind = 'election';
  else kind = 'game';
  if (current && current.kind === kind && current.inst?.update) { current.inst.update(); return; }
  if (current?.inst?.destroy) current.inst.destroy();
  clear(app);
  let inst = null;
  if (kind === 'auth') inst = authScreen(app, { onAuth: u => { store.user = u; connect(); render(); } });
  else if (kind === 'home') inst = homeScreen(app);
  else if (kind === 'lobby') inst = lobbyScreen(app);
  else if (kind === 'game') { inst = createGameScreen(); app.append(inst.el); inst.update(); }
  else if (kind === 'election') { inst = createElection({ onExplore: () => { store.ui.electionSeen = v.code; render(); } }); app.append(inst.el); inst.start(); }
  current = { kind, inst };
}

async function boot() {
  try {
    [store.meta, store.map] = await Promise.all([api('/api/meta'), api('/api/map')]);
    if (getToken()) { try { store.user = (await api('/api/auth/me')).user; connect(); } catch { setToken(null); } }
    render();
  } catch (e) {
    clear(app); app.append(h('div', { class: 'boot' }, h('p', null, 'Could not reach the game server: ' + e.message), h('button', { class: 'btn primary', onClick: () => location.reload() }, 'Retry')));
  }
}
boot();
