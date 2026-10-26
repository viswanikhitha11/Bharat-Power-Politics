'use strict';
// Creates the SQLite database file with the full schema (also done automatically on server start).
const db = require('../server/db');
db.open().then(() => { db.close(); console.log('Database ready.'); });
