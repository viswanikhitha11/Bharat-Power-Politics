'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cfg = require('./config');
const db = require('./db');

const USER_RE = /^[A-Za-z0-9_]{3,20}$/;
const sign = u => jwt.sign({ uid: u.id, un: u.username }, cfg.JWT_SECRET, { expiresIn: cfg.JWT_EXPIRES });
const publicUser = u => ({ id: u.id, username: u.username, displayName: u.display_name });
function verify(token) {
  try {
    const p = jwt.verify(token, cfg.JWT_SECRET);
    const u = db.get('SELECT id, username, display_name, banned FROM users WHERE id = ?', [p.uid]);
    return u && !u.banned ? u : null;
  } catch { return null; }
}
function register(username, password, displayName) {
  if (typeof username !== 'string' || !USER_RE.test(username)) return { error: 'Username must be 3-20 letters, numbers or underscores.' };
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return { error: 'Password must be 8-128 characters.' };
  const dn = String(displayName || username).trim().replace(/[\u0000-\u001f<>]/g, '').slice(0, 24) || username;
  if (db.get('SELECT 1 AS x FROM users WHERE username = ?', [username])) return { error: 'That username is taken.' };
  const hash = bcrypt.hashSync(password, 10);
  const id = db.insert('INSERT INTO users (username, display_name, password_hash, last_login) VALUES (?,?,?,CURRENT_TIMESTAMP)', [username, dn, hash]);
  db.run('INSERT INTO user_stats (user_id) VALUES (?)', [id]);
  const u = { id, username, display_name: dn };
  return { token: sign(u), user: publicUser(u) };
}
function login(username, password) {
  const u = typeof username === 'string' && typeof password === 'string' ? db.get('SELECT * FROM users WHERE username = ?', [username]) : null;
  // constant-ish time: always run a compare
  const ok = bcrypt.compareSync(String(password || ''), u ? u.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
  if (!u || !ok || u.banned) return { error: 'Invalid username or password.' };
  db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [u.id]);
  return { token: sign(u), user: publicUser(u) };
}
function middleware(req, res, next) {
  const h = req.headers.authorization || '';
  const u = h.startsWith('Bearer ') ? verify(h.slice(7)) : null;
  if (!u) return res.status(401).json({ error: 'Not signed in.' });
  req.user = u; next();
}
module.exports = { register, login, verify, middleware, publicUser };
