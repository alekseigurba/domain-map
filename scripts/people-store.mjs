// The people who may open the map, what each may do, and the logins that say
// who is who. Every call is one statement or one transaction, as the version
// store's are, so what it answers is what the database holds.
//
// A failure a person can do something about carries an HTTP status, and the
// server passes it on as it is: 404 for a person who is not there, 409 for an
// address already on the list or a change that would leave the map without an
// administrator, 400 for a role that is not one.

import { ADMINISTRATOR, CONTRIBUTOR, ROLES, isRole } from './roles.mjs';

const failure = (status, message) => Object.assign(new Error(message), { status });

/** Names and addresses are what an administrator types or a provider sends; either can be anything. */
const MAX_LENGTH = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The key every change to a role or to the list takes a lock on, for the
 * length of its transaction. Two administrators taking each other down at the
 * same moment would each see the other still there and both go through; one
 * at a time, the second sees what the first did.
 */
const ROLES_LOCK = 0x70656f70; // "peop"

const COLUMNS = `p.id, p.name, p.email, p.role, p.created_at, p.last_signed_in,
  coalesce((select array_agg(l.source order by l.source) from logins l where l.person_id = p.id), '{}') as sources,
  (select count(*) from versions v where v.sandbox_of = p.id)::int as drafts`;

function toPerson(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at.toISOString(),
    lastSignedIn: row.last_signed_in?.toISOString() ?? null,
    // Which doors they have come in by. Empty until the first sign-in.
    sources: row.sources,
    // How many versions their sandbox holds — the count, never what.
    drafts: row.drafts,
  };
}

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

/** An address as it is matched: what was typed, case-folded. */
const folded = (email) => trimmed(email).toLowerCase();

function checkName(name) {
  if (name.length === 0 || name.length > MAX_LENGTH) return `A name is 1..${MAX_LENGTH} characters.`;
  return null;
}

function checkEmail(email) {
  if (email.length === 0 || email.length > MAX_LENGTH || !email.includes('@') || /\s/.test(email)) {
    return 'An email address is needed, to know them by when they sign in.';
  }
  return null;
}

export function peopleStore(pool) {
  /** Everyone on the list, by name. */
  async function list() {
    const { rows } = await pool.query(`select ${COLUMNS} from people p order by lower(p.name), p.created_at`);
    return rows.map(toPerson);
  }

  async function read(id) {
    if (!UUID.test(id ?? '')) return null;
    const { rows } = await pool.query(`select ${COLUMNS} from people p where p.id = $1`, [id]);
    return rows[0] ? toPerson(rows[0]) : null;
  }

  async function byEmail(email) {
    const { rows } = await pool.query(`select ${COLUMNS} from people p where lower(p.email) = $1`, [folded(email)]);
    return rows[0] ? toPerson(rows[0]) : null;
  }

  /** The person a login belongs to, or null: nobody has signed in this way before. */
  async function byLogin(source, subject) {
    const { rows } = await pool.query(
      `select ${COLUMNS} from people p join logins l on l.person_id = p.id where l.source = $1 and l.subject = $2`,
      [source, subject]);
    return rows[0] ? toPerson(rows[0]) : null;
  }

  async function hasAdministrator() {
    const { rows } = await pool.query(`select 1 from people where role = '${ADMINISTRATOR}'`);
    return rows.length > 0;
  }

  /**
   * Someone has signed in. They are the login's person; failing a login, the
   * person an administrator added under one of the addresses they carry, who
   * now has a login; failing that, someone new -- a contributor, or the
   * administrator when there is none yet, which is how the first person in
   * gets the keys with OWNER_EMAILS unset. The provider's name for them wins
   * over whatever was typed when they were added.
   *
   * The page fires several requests at once on a first visit, so two of these
   * can race to make the same person: the second loses on the login's key and
   * reads what the first made.
   */
  async function signIn({ source, subject, name, emails = [] }) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const known = await client.query(
          'update logins set last_seen = now() where source = $1 and subject = $2 returning person_id',
          [source, subject]);
        let personId = known.rows[0]?.person_id ?? null;

        if (!personId) {
          const addresses = emails.map(folded).filter(Boolean);
          if (addresses.length > 0) {
            const { rows } = await client.query(
              'select id from people where lower(email) = any($1) order by created_at limit 1', [addresses]);
            personId = rows[0]?.id ?? null;
          }
          if (!personId) {
            const { rows: [{ count }] } = await client.query(
              `select count(*)::int as count from people where role = '${ADMINISTRATOR}'`);
            const { rows } = await client.query(
              'insert into people (name, email, role) values ($1, $2, $3) returning id',
              [trimmed(name) || subject, trimmed(emails[0]) || null, count === 0 ? ADMINISTRATOR : CONTRIBUTOR]);
            personId = rows[0].id;
          }
          await client.query('insert into logins (source, subject, person_id) values ($1, $2, $3)', [source, subject, personId]);
        }

        await client.query(
          'update people set name = coalesce(nullif($2, \'\'), name), email = coalesce(email, $3), last_signed_in = now() where id = $1',
          [personId, trimmed(name), trimmed(emails[0]) || null]);
        await client.query('commit');
        return read(personId);
      } catch (error) {
        await client.query('rollback').catch(() => {});
        if (error.code !== '23505' || attempt > 0) throw error;
      } finally {
        client.release();
      }
    }
    throw new Error('Could not record the sign-in.');
  }

  /** A visit, for "last signed in": the page asks who it is once each time it loads. */
  async function touch(id) {
    await pool.query('update people set last_signed_in = now() where id = $1', [id]);
  }

  /** An administrator adds someone by email, ahead of their first sign-in. */
  async function add({ name, email, role }) {
    const address = trimmed(email);
    const called = trimmed(name) || address;
    const problem = checkEmail(address) ?? checkName(called) ?? checkRole(role);
    if (problem) throw failure(400, problem);

    try {
      const { rows } = await pool.query(
        'insert into people (name, email, role) values ($1, $2, $3) returning id', [called, address, role]);
      return read(rows[0].id);
    } catch (error) {
      if (error.code === '23505') throw failure(409, `Someone on the list already has the address ${address}.`);
      throw error;
    }
  }

  function checkRole(role) {
    return isRole(role) ? null : `A role is one of ${ROLES.join(', ')}.`;
  }

  /**
   * `work(client, person)` in one transaction, holding the roles lock, with the
   * person as the database has them now. Refused before anything is done when
   * they are not there, when it is `by` acting on their own row — a role is
   * changed and a person removed by someone else, so whoever does it is still
   * an administrator after — or when the change `demotes` an administrator
   * and there is no other.
   */
  async function withPerson(id, { by = null, own, demotes }, work) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock($1)', [ROLES_LOCK]);
      const { rows: [person] } = await client.query(
        'select id, name, role from people where id = $1', [UUID.test(id ?? '') ? id : null]);
      if (!person) throw failure(404, 'There is no such person.');
      if (by && by === person.id) throw failure(409, own);
      if (person.role === ADMINISTRATOR && demotes) {
        const { rows: [{ count }] } = await client.query(
          `select count(*)::int as count from people where role = '${ADMINISTRATOR}' and id <> $1`, [person.id]);
        if (count === 0) throw failure(409, `${person.name} is the only administrator. Make someone else one first.`);
      }
      const answer = await work(client, person);
      await client.query('commit');
      return answer;
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Change what a person may do, the administrator's role as any other. `by`
   * is who asks, when someone does: nobody changes their own row, and the last
   * administrator stays one.
   */
  async function setRole(id, role, { by } = {}) {
    const problem = checkRole(role);
    if (problem) throw failure(400, problem);
    await withPerson(id, {
      by,
      own: 'Your own role is changed by another administrator, not on your own row.',
      demotes: role !== ADMINISTRATOR,
    }, (client, person) => client.query('update people set role = $2 where id = $1', [person.id, role]));
    return read(id);
  }

  /**
   * Take someone off the list, and their sandbox with them: the database
   * deletes the versions in it, and what they shared stays shared, with nobody
   * as its sharer. Their logins go too, so a sign-in they can still make finds
   * nobody, and they come back as anyone new does.
   */
  async function remove(id, { by } = {}) {
    await withPerson(id, {
      by,
      own: 'Nobody takes themselves off the list: another administrator does.',
      demotes: true,
    }, (client, person) => client.query('delete from people where id = $1', [person.id]));
  }

  /**
   * Correct a name or an address typed by an administrator. Only until the
   * person has signed in: after that the provider's name is the name, and the
   * address is what their login was matched by.
   */
  async function edit(id, { name, email }) {
    const person = await read(id);
    if (!person) throw failure(404, 'There is no such person.');
    if (person.sources.length > 0) throw failure(409, `${person.name} has signed in, so their name and address come from the sign-in now.`);

    const called = name === undefined ? person.name : trimmed(name);
    const address = email === undefined ? person.email : trimmed(email);
    const problem = checkName(called) ?? checkEmail(address ?? '');
    if (problem) throw failure(400, problem);

    try {
      await pool.query('update people set name = $2, email = $3 where id = $1', [id, called, address]);
    } catch (error) {
      if (error.code === '23505') throw failure(409, `Someone on the list already has the address ${address}.`);
      throw error;
    }
    return read(id);
  }

  /**
   * Fill an empty table, once, from OWNER_EMAILS: the first address is the
   * administrator and the rest are contributors, each named by their address
   * until they sign in. Called on the client that holds the migration lock, so
   * two replicas starting together cannot both do it. Answers with the
   * addresses seeded, none when the table already had people in it.
   */
  async function seedIfEmpty(client, emails) {
    const { rows: [{ count }] } = await client.query('select count(*)::int as count from people');
    if (count > 0 || emails.length === 0) return [];

    for (const [index, email] of emails.entries()) {
      await client.query(
        'insert into people (name, email, role) values ($1, $1, $2)',
        [email, index === 0 ? ADMINISTRATOR : CONTRIBUTOR]);
    }
    return emails;
  }

  return { list, read, byEmail, byLogin, hasAdministrator, signIn, touch, add, setRole, remove, edit, seedIfEmpty };
}
