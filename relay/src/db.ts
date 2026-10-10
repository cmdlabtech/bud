// Minimal SQL adapter so the same store code runs on Durable Object SQLite
// (ctx.storage.sql) and on node:sqlite in unit tests.
export interface Sql {
  all<T = Record<string, unknown>>(query: string, ...params: unknown[]): T[];
  run(query: string, ...params: unknown[]): void;
}

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS pair_codes (code_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, device_id TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL, reply_short TEXT, created_at INTEGER NOT NULL, replied_at INTEGER, seen INTEGER NOT NULL DEFAULT 1)`,
  `CREATE INDEX IF NOT EXISTS messages_bot ON messages (bot_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS needs (id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, ref TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open', action TEXT, action_at INTEGER, snooze_until INTEGER, UNIQUE (bot_id, ref))`,
  `CREATE TABLE IF NOT EXISTS nonces (request_id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rate (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL)`,
];

export function migrate(sql: Sql): void {
  for (const s of SCHEMA) sql.run(s);
}

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const NONCE_TTL_MS = 10 * 60 * 1000;

export function purge(sql: Sql, now: number): void {
  const cutoff = now - RETENTION_MS;
  sql.run(`DELETE FROM messages WHERE created_at < ?`, cutoff);
  sql.run(`DELETE FROM needs WHERE created_at < ?`, cutoff);
  sql.run(`DELETE FROM nonces WHERE expires_at < ?`, now);
  sql.run(`DELETE FROM pair_codes WHERE expires_at < ?`, now);
  sql.run(`DELETE FROM rate WHERE window_start < ?`, now - 24 * 60 * 60 * 1000);
}
