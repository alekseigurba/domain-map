// Postgres, which holds the versions of the map and which one is published.
// Only that: icons, the logo and the settings are still files in the store.
//
// The schema is a folder of numbered .sql files, applied in name order at
// startup and recorded in a table of their own, so a database is brought up to
// date by starting the server against it. There is nothing to run by hand.

import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);

/** Any number will do, as long as nothing else using the database takes it too. */
const LOCK_KEY = 0x646d6170; // "dmap"

export function openDatabase(url) {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  // An idle connection that drops -- the database restarting -- is reported on
  // the pool, and an error event nobody listens to takes the process down.
  pool.on('error', (error) => console.error(`Postgres: ${error.message}`));
  return pool;
}

/**
 * Wait for the database to answer. Compose starts it alongside the app and a
 * platform may start them in any order, so a first refusal is not a failure.
 */
export async function waitForDatabase(pool, { attempts = 30, delayMs = 1000, log = () => {} } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('select 1');
      return;
    } catch (error) {
      if (attempt >= attempts) throw new Error(`Could not reach Postgres: ${error.message}`);
      if (attempt === 1) log(`Waiting for Postgres: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Run `work` holding a lock every instance of this server takes before it
 * touches the schema, so two replicas starting together neither apply the same
 * migration twice nor both fill an empty table.
 */
export async function withLock(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    try {
      return await work(client);
    } finally {
      await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

/** Apply every migration not applied yet, each in a transaction of its own. Answers with their names. */
export async function migrate(client) {
  await client.query(`create table if not exists schema_migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
  )`);
  const done = new Set((await client.query('select name from schema_migrations')).rows.map((row) => row.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();

  const applied = [];
  for (const name of files) {
    if (done.has(name)) continue;
    const sql = await readFile(new URL(name, MIGRATIONS_DIR), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [name]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw new Error(`Migration ${name} failed: ${error.message}`);
    }
    applied.push(name);
  }
  return applied;
}

/** Where the database is, for the log: host and name, never the password. */
export function describeDatabase(url) {
  try {
    const { host, pathname } = new URL(url);
    return `${host}${pathname}`;
  } catch {
    return 'Postgres';
  }
}
