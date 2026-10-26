'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
const root = path.resolve(__dirname, '..');
const cfg = {
  ROOT: root,
  PORT: parseInt(process.env.PORT, 10) || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  JWT_EXPIRES: process.env.JWT_EXPIRES || '7d',
  DB_FILE: path.resolve(root, process.env.DB_FILE || 'data/bharat.sqlite'),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  MAX_ROOMS: parseInt(process.env.MAX_ROOMS, 10) || 200,
  RANKED_GAMES_PER_DAY: parseInt(process.env.RANKED_GAMES_PER_DAY, 10) || 5,
};
if (cfg.JWT_SECRET === 'dev-insecure-secret-change-me') {
  console.warn('[warn] JWT_SECRET is not set - using an insecure development default. Run setup.bat or edit .env.');
}
module.exports = cfg;
