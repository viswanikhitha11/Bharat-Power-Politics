'use strict';
// Optional smoke test: bundles the browser code with esbuild and drives the real UI in jsdom against a live server.
// Not a substitute for testing in a real browser (no layout/CSS/canvas), but catches runtime errors in every screen.
const os = require('os'), path = require('path'), fs = require('fs');
process.env.DB_FILE = path.join(os.tmpdir(), 'bpp-ui-' + process.pid + '.sqlite'); process.env.JWT_SECRET = 'ui-test';
const { JSDOM, VirtualConsole } = require('jsdom'); const esbuild = require('esbuild'); const { io } = require('socket.io-client');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const cfg = require('../server/config'); cfg.PORT = 0;
  const { server, rooms, io: sio } = await require('../server/index').main();
  await new Promise(r => server.listening ? r() : server.once('listening', r));
  const base = 'http://localhost:' + server.address().port;
  const bundle = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../public/js/main.js')], bundle: true, format: 'iife', write: false }).outputFiles[0].text;
  const reg = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'uitest', password: 'password123', displayName: 'UI Tester' }) })).json();
  const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message)); vc.on('error', e => errors.push(String(e)));
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8').replace(/<script[^>]*><\/script>/g, ''), { url: base + '/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window; w.localStorage.setItem('bpp_token', reg.token);
  w.fetch = (u, o) => fetch(new URL(u, base), o); w.io = (opts) => io(base, { ...opts, transports: ['websocket'] });
  w.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }); w.HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillRect() {} });
  w.navigator.clipboard = { writeText() {} }; w.eval(bundle);
  const txt = () => w.document.body.textContent;
  const click = label => { const b = [...w.document.querySelectorAll('button')].find(x => x.textContent.includes(label) && !x.disabled); if (!b) throw new Error('no enabled button: ' + label + '\n' + txt().slice(0, 300)); b.click(); };
  const waitFor = async (re, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (re.test(txt())) return; await sleep(50); } throw new Error('timeout waiting for ' + re + '\n' + txt().slice(0, 400)); };
  await waitFor(/Host a new election/); console.log('home ok'); await sleep(600);
  click('Solo vs 3 AI'); await waitFor(/Start the campaign/); console.log('lobby ok');
  click('Start the campaign'); await waitFor(/Round/); await waitFor(/Projected seats/); console.log('game ok'); await sleep(300); console.log('geo paths:', w.document.querySelectorAll('path.cell').length);
  const cells = w.document.querySelectorAll('rect.cell'); if (cells.length !== 543) throw new Error('cells ' + cells.length);
  cells[10].dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await waitFor(/Voter groups here/);
  w.document.querySelector('.act button').click(); await waitFor(/Organisation/);
  for (const t of ['Party', 'Manifesto', 'Nation', 'Parties', 'Feed', 'Seat']) { click(t); await sleep(60); }
  console.log('tabs ok');
  const rounds = 10;
  for (let r = 1; r <= rounds; r++) { click('End turn'); await sleep(150); }
  await waitFor(/ELECTION NIGHT/, 15000); console.log('election started');
  click('Skip'); await waitFor(/next Prime Minister/); console.log('results ok');
  click('Explore results'); await waitFor(/Final seat tally/); console.log('explore ok');
  console.log(errors.length ? 'JS ERRORS:\n' + errors.join('\n') : 'no jsdom errors');
  rooms.shutdown(); sio.close(); server.close(); try { fs.unlinkSync(process.env.DB_FILE); } catch {} process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('SMOKE FAIL:', e.message); process.exit(1); });
