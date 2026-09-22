#!/usr/bin/env node
// Make someone the administrator from outside the app, for the day the
// administrator has left without handing over and nobody can open Users &
// access with the right to change it. It runs against DATABASE_URL, the way
// the server does — on a Container App, through `az containerapp exec` into
// the running revision — and says who was demoted.
//
//   npm run make-administrator -- someone@example.com
import { openDatabase, waitForDatabase } from './database.mjs';
import { peopleStore } from './people-store.mjs';
import { CONTRIBUTOR } from './roles.mjs';

const email = process.argv[2]?.trim() ?? '';
if (!email.includes('@')) {
  console.error('Usage: npm run make-administrator -- someone@example.com');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set: it names the Postgres the people live in.');
  process.exit(2);
}

const pool = openDatabase(process.env.DATABASE_URL);
try {
  await waitForDatabase(pool, { attempts: 3 });
  const people = peopleStore(pool);
  // Someone not on the list yet is added by address, as an administrator
  // would add them, and signs in to the role on their first visit.
  const person = await people.byEmail(email) ?? await people.add({ name: email, email, role: CONTRIBUTOR });
  const { previous } = await people.makeAdministrator(person.id);
  console.log(`${person.name} <${person.email}> is the administrator`
    + `${previous ? `; ${previous.name} is a publisher now` : ''}.`);
} catch (error) {
  // The tables are the server's to make: a database it has never started
  // against has none, and the message should say so rather than quote SQL.
  console.error(error.code === '42P01'
    ? 'This database has no people table yet. Start the server against it first.'
    : error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
