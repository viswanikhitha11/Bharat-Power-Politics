'use strict';
// Creates .env from .env.example with a freshly generated random JWT secret (only if .env does not exist yet).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '..'), env = path.join(root, '.env');
if (fs.existsSync(env)) { console.log('.env already exists - leaving it unchanged.'); process.exit(0); }
let t = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
t = t.replace(/^JWT_SECRET=.*$/m, 'JWT_SECRET=' + crypto.randomBytes(48).toString('hex'));
fs.writeFileSync(env, t); console.log('Created .env with a new random JWT_SECRET.');
