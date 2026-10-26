let token = localStorage.getItem('bpp_token') || null;
export const getToken = () => token;
export function setToken(t) { token = t; t ? localStorage.setItem('bpp_token', t) : localStorage.removeItem('bpp_token'); }
export async function api(path, body) {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status });
  return j;
}
