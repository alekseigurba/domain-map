// A throwaway database for a test, made on the Postgres that docker-compose.yml
// runs (or the one TEST_DATABASE_URL names) and dropped again afterwards, so a
// test never touches the database `npm start` uses.
//   docker compose up -d postgres

import { randomBytes } from 'node:crypto';
import pg from 'pg';

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://domainmap:domainmap@localhost:5432/domainmap';

async function admin(work) {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await client.connect();
  } catch (error) {
    const { host } = new URL(ADMIN_URL);
    throw new Error(`These tests need Postgres at ${host} (${error.message}). `
      + 'Start it with `docker compose up -d postgres`, or point TEST_DATABASE_URL at another.');
  }
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** `{ url, drop }` for a database nobody else is using. */
export async function throwawayDatabase(label) {
  const name = `domain_map_test_${label}_${randomBytes(4).toString('hex')}`;
  await admin((client) => client.query(`create database ${name}`));

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return {
    url: url.href,
    // Forced, since a server that has just been stopped may not have let go yet.
    drop: () => admin((client) => client.query(`drop database if exists ${name} with (force)`)),
  };
}
