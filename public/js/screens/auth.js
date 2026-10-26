import { h } from '../ui.js';
import { api, setToken } from '../api.js';

export function authScreen(root, { onAuth }) {
  let mode = 'login';
  const err = h('div', { class: 'err' });
  const u = h('input', { placeholder: 'username', autocomplete: 'username', maxlength: 20 });
  const p = h('input', { type: 'password', placeholder: 'password (min 8 characters)', autocomplete: 'current-password' });
  const dn = h('input', { placeholder: 'display name (shown to other players)', maxlength: 24 });
  const dnWrap = h('div', null, h('label', null, 'Display name'), dn);
  const tabs = h('div', { class: 'tabs' });
  const go = h('button', { class: 'btn primary block', style: { marginTop: '12px' } });
  async function submit() {
    err.textContent = ''; go.disabled = true;
    try {
      const r = await api(mode === 'login' ? '/api/auth/login' : '/api/auth/register', { username: u.value.trim(), password: p.value, displayName: dn.value.trim() });
      setToken(r.token); onAuth(r.user);
    } catch (e) { err.textContent = e.message; } finally { go.disabled = false; }
  }
  function draw() {
    tabs.replaceChildren(...['login', 'register'].map(m => h('button', { class: mode === m ? 'on' : '', onClick: () => { mode = m; draw(); } }, m === 'login' ? 'Sign in' : 'Create account')));
    dnWrap.style.display = mode === 'register' ? '' : 'none';
    go.textContent = mode === 'login' ? 'Sign in' : 'Create account & play';
    p.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  }
  [u, p, dn].forEach(i => i.addEventListener('keydown', e => e.key === 'Enter' && submit()));
  go.addEventListener('click', submit); draw();
  root.append(h('div', { class: 'auth fade' },
    h('div', { class: 'hero' },
      h('div', { class: 'tricolor', style: { width: '120px', marginBottom: '18px' } }),
      h('h1', null, 'Bharat-Power-Politics'),
      h('p', null, 'The race for 272. Lead a party across 543 constituencies — rally crowds, court voter groups, run the economy, forge alliances and win on election night.'),
      h('div', { class: 'feat' },
        h('div', null, '🗺️ Interactive map of all 543 seats'), h('div', null, '👥 Up to 7 players per room'),
        h('div', null, '📣 Rallies, ads, polls & booth workers'), h('div', null, '📊 Economy, budget & public approval'),
        h('div', null, '🤝 Alliances & coalition governments'), h('div', null, '🌙 Live election-night results')),
      h('p', { class: 'muted small', style: { marginTop: '18px' } }, 'All parties and leaders are fictional.')),
    h('div', { class: 'card' }, h('h2', null, 'Welcome, candidate'), tabs,
      h('label', null, 'Username'), u, h('label', null, 'Password'), p, dnWrap, go, err)));
  return {};
}
