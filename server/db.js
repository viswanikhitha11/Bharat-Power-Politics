'use strict';
// SQLite via sql.js (pure WebAssembly: no native compilation needed on Windows).
// The database lives in memory and is flushed atomically to DB_FILE (debounced + on shutdown).
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
let db = null, saveTimer = null, dirty = false;

async function open(file = cfg.DB_FILE) {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const buf = file !== ':memory:' && fs.existsSync(file) ? fs.readFileSync(file) : null;
  db = new SQL.Database(buf);
  db.run('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  cfg._dbFile = file;
  save();
  return module.exports;
}
function schedule() { dirty = true; if (!saveTimer) saveTimer = setTimeout(save, 1500); if (saveTimer.unref) saveTimer.unref(); }
function save() {
  clearTimeout(saveTimer); saveTimer = null;
  if (!db || !dirty && fs.existsSync(cfg._dbFile || '')) return;
  dirty = false;
  const file = cfg._dbFile; if (!file || file === ':memory:') return;
  const data = Buffer.from(db.export());
  db.run('PRAGMA foreign_keys = ON'); // export() resets pragmas
  const tmp = file + '.tmp'; fs.writeFileSync(tmp, data); fs.renameSync(tmp, file);
}
function run(sql, params = []) { const st = db.prepare(sql); try { st.run(params); } finally { st.free(); } schedule(); }
function all(sql, params = []) { const st = db.prepare(sql); const rows = []; try { st.bind(params); while (st.step()) rows.push(st.getAsObject()); } finally { st.free(); } return rows; }
function get(sql, params = []) { return all(sql, params)[0] || null; }
function insert(sql, params = []) { run(sql, params); return get('SELECT last_insert_rowid() AS id').id; }
function tx(fn) { db.run('BEGIN'); try { const r = fn(); db.run('COMMIT'); schedule(); return r; } catch (e) { try { db.run('ROLLBACK'); } catch (_) {} throw e; } }
function close() { save(); }
module.exports = { open, run, all, get, insert, tx, save, close };
