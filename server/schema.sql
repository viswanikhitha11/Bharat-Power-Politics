-- Bharat-Power-Politics database schema (SQLite). Applied automatically at startup (idempotent).
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login    TEXT,
  banned        INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS games (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  host_user_id  INTEGER REFERENCES users(id),
  status        TEXT NOT NULL CHECK (status IN ('lobby','playing','finished','abandoned')),
  ranked        INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT,
  state_json    TEXT,                 -- full engine snapshot for crash recovery (cleared when finished)
  rounds_played INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at    TEXT,
  finished_at   TEXT
);
CREATE TABLE IF NOT EXISTS game_players (
  game_id   INTEGER NOT NULL REFERENCES games(id),
  seat_key  TEXT NOT NULL,            -- party id, e.g. BRD
  user_id   INTEGER REFERENCES users(id), -- NULL for AI parties
  is_bot    INTEGER NOT NULL DEFAULT 0,
  display_name TEXT,
  PRIMARY KEY (game_id, seat_key)
);
CREATE TABLE IF NOT EXISTS game_results (
  game_id     INTEGER NOT NULL REFERENCES games(id),
  party_id    TEXT NOT NULL,
  user_id     INTEGER REFERENCES users(id),
  display_name TEXT,
  seats       INTEGER NOT NULL,
  vote_share  REAL NOT NULL,
  rank        INTEGER NOT NULL,
  is_pm       INTEGER NOT NULL DEFAULT 0,
  in_government INTEGER NOT NULL DEFAULT 0,
  points      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, party_id)
);
CREATE TABLE IF NOT EXISTS constituency_results (
  game_id         INTEGER NOT NULL REFERENCES games(id),
  constituency_id TEXT NOT NULL,
  winner_party    TEXT NOT NULL,
  runner_up       TEXT,
  margin          REAL,
  turnout         REAL,
  shares_json     TEXT,
  PRIMARY KEY (game_id, constituency_id)
);
CREATE TABLE IF NOT EXISTS action_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id    INTEGER NOT NULL,
  round      INTEGER NOT NULL,
  party_id   TEXT,
  user_id    INTEGER,
  type       TEXT NOT NULL,
  payload    TEXT,
  ok         INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_stats (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id),
  ranked_games   INTEGER NOT NULL DEFAULT 0,
  wins           INTEGER NOT NULL DEFAULT 0,
  total_seats    INTEGER NOT NULL DEFAULT 0,
  best_seats     INTEGER NOT NULL DEFAULT 0,
  points         INTEGER NOT NULL DEFAULT 0,
  last_ranked_day TEXT,
  ranked_today   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER, user_id INTEGER, display_name TEXT, text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_results_user ON game_results(user_id);
CREATE INDEX IF NOT EXISTS idx_action_game ON action_log(game_id, round);
