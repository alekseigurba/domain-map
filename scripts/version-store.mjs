// The versions of the map: each in somebody's sandbox or shared, and one of
// the shared ones published. A sandbox is one person's — what they save is
// theirs until they share it, and nobody else, not a publisher, not the
// administrator, is shown what is in it. Shared is what every contributor
// sees: fixed copies put in the open, never edited in place. To change one, a
// contributor takes a copy into their sandbox, works, and shares again. What
// was here before sandboxes was site-wide, and is shared.
//
// Every call is one statement or one transaction, so what it answers is what
// the database holds. A failure a person can do something about carries an
// HTTP status, and the server passes it on as it is: 404 for a version that is
// not there, 409 for one that changed, cannot be deleted or holds the name,
// 403 for a shared version that is somebody else's to rename or delete.

/**
 * Which list a row is in, as a where clause: a sandbox is one person's rows,
 * and shared is the rows with no sandbox at all. Spelled out rather than
 * through coalesce, since a null sandbox coalesces to anyone's.
 */
const IN = (scope) => (scope === 'sandbox' ? 'v.sandbox_of = $3' : 'v.sandbox_of is null');

const COLUMNS = `v.name, v.created_at, v.created_by_name, v.created_by_email,
  v.updated_at, v.updated_by_name, v.updated_by_email, v.sandbox_of, v.shared_by,
  coalesce(s.published_version_id = v.id, false) as published`;

/** One row per version, with the site row beside it to tell which is published. */
const FROM = 'versions v cross join site s';

const failure = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

const person = (name, email) => (name || email ? { name: name ?? null, email: email ?? null } : null);

/**
 * Whether `me` may rename or delete this shared version without being a
 * publisher: they shared it — or, for one from before sandboxes, they saved
 * it, which the address on it says.
 */
function isMine(row, me) {
  if (row.sandbox_of !== null || !me) return false;
  if (row.shared_by !== null) return row.shared_by === me.id;
  return Boolean(row.created_by_email && me.email
    && row.created_by_email.toLowerCase() === me.email.toLowerCase());
}

function toVersion(row, me = null) {
  return {
    name: row.name,
    createdAt: row.created_at.toISOString(),
    createdBy: person(row.created_by_name, row.created_by_email),
    updatedAt: row.updated_at.toISOString(),
    updatedBy: person(row.updated_by_name, row.updated_by_email),
    published: row.published,
    scope: row.sandbox_of === null ? 'shared' : 'sandbox',
    mine: isMine(row, me),
    ...(row.document !== undefined && { document: row.document }),
  };
}

/** `v1`, `v2`, `v3`: the names a sandbox gives. A version imported from a file keeps its own. */
const NUMBERED = /^v(\d+)$/;

export function versionStore(pool) {
  /** Every shared version, without its document: newest first, and in an order a save does not reshuffle. */
  async function listShared(me) {
    const { rows } = await pool.query(
      `select ${COLUMNS} from ${FROM} where v.sandbox_of is null order by v.created_at desc, v.name desc`);
    return rows.map((row) => toVersion(row, me));
  }

  /** Every version in `me`'s sandbox, without its document. */
  async function listDrafts(me) {
    const { rows } = await pool.query(
      `select ${COLUMNS} from ${FROM} where v.sandbox_of = $1 order by v.created_at desc, v.name desc`, [me.id]);
    return rows.map((row) => toVersion(row, me));
  }

  async function readShared(name, me = null) {
    const { rows } = await pool.query(
      `select ${COLUMNS}, v.document from ${FROM} where v.sandbox_of is null and v.name = $1`, [name]);
    return rows[0] ? toVersion(rows[0], me) : null;
  }

  async function readDraft(name, me) {
    const { rows } = await pool.query(
      `select ${COLUMNS}, v.document from ${FROM} where v.sandbox_of = $2 and v.name = $1`, [name, me.id]);
    return rows[0] ? toVersion(rows[0], me) : null;
  }

  async function published(me = null) {
    const { rows } = await pool.query(
      `select ${COLUMNS}, v.document from versions v join site s on s.published_version_id = v.id`);
    return rows[0] ? toVersion(rows[0], me) : null;
  }

  /**
   * A new version in `me`'s sandbox. Asked for by name — a copy taken, or a
   * shared version saved — it takes that name if the sandbox has it free, and
   * the name with a (2), (3) after it otherwise. Unnamed, it takes the next
   * number the sandbox has not used: `v1`, `v2`, `v3`, counting only this
   * sandbox, so what is shared or in anyone else's never holds a number back.
   * Two saves at once can reach for the same name, and the unique index
   * decides which gets it; the other tries the next.
   */
  async function createDraft(document, by, me, { name = null } = {}) {
    for (let attempt = 0; attempt < 20; attempt++) {
      let wanted;
      if (name == null) {
        const { rows: taken } = await pool.query(
          "select name from versions where sandbox_of = $1 and name ~ '^v[0-9]+$'", [me.id]);
        const highest = Math.max(0, ...taken.map((row) => Number(NUMBERED.exec(row.name)[1])));
        wanted = `v${highest + 1}`;
      } else {
        wanted = attempt === 0 ? name : `${name} (${attempt + 1})`;
      }
      try {
        await pool.query(
          `insert into versions (name, document, sandbox_of, created_by_name, created_by_email, updated_by_name, updated_by_email)
           values ($1, $2, $3, $4, $5, $4, $5)`,
          [wanted, document, me.id, by?.name ?? null, by?.email ?? null]);
        return readDraft(wanted, me);
      } catch (error) {
        if (error.code !== '23505') throw error;
      }
    }
    throw failure(409, 'Could not find a free name for the new version. Try again.');
  }

  /**
   * Write over a sandbox version, but only the one the client opened: `base`
   * is the `updatedAt` it was given, and a version saved since then — from
   * another tab of the same person's — is left alone. The 409 carries the
   * version as it is now, so the client can say when.
   */
  async function saveDraft(name, document, base, by, me) {
    const { rows } = await pool.query(
      `update versions
          set document = $2, updated_at = now(), updated_by_name = $4, updated_by_email = $5
        where sandbox_of = $6 and name = $1 and updated_at = $3
        returning name`,
      [name, document, base, by?.name ?? null, by?.email ?? null, me.id]);
    if (rows[0]) return readDraft(name, me);

    const now = await readDraft(name, me);
    if (!now) throw failure(404, `There is no version "${name}" in your sandbox.`);
    const { document: _, ...version } = now;
    throw failure(409, `"${name}" has been saved since you opened it.`, { version });
  }

  /**
   * Give a version another name, in the sandbox or in the open. The name is
   * also the version's address — a link names it — so a link to the old one
   * stops working, which is what the dialog warns about before it asks.
   * `updated_at` is left where it is: renaming is not a save.
   */
  async function rename(scope, from, to, me, { force = false } = {}) {
    const row = scope === 'sandbox' ? await readDraft(from, me) : await readShared(from, me);
    if (!row) throw failure(404, `There is no ${scope === 'sandbox' ? 'version in your sandbox' : 'shared version'} called "${from}".`);
    if (scope === 'shared' && !force && !row.mine) {
      throw failure(403, `"${from}" is ${sharerOf(row)}'s shared version. Only they, a publisher or the administrator can rename it.`);
    }
    if (from === to) return row;

    try {
      await pool.query(
        `update versions v set name = $2 where v.name = $1 and ${IN(scope)}`,
        scope === 'sandbox' ? [from, to, me.id] : [from, to]);
    } catch (error) {
      if (error.code === '23505') {
        throw failure(409, `There is already a ${scope === 'sandbox' ? 'version in your sandbox' : 'shared version'} called "${to}".`);
      }
      throw error;
    }
    return scope === 'sandbox' ? readDraft(to, me) : readShared(to, me);
  }

  /** Delete a version for good. The published one cannot go: the site row's foreign key says so. */
  async function remove(scope, name, me, { force = false } = {}) {
    const row = scope === 'sandbox' ? await readDraft(name, me) : await readShared(name, me);
    if (!row) throw failure(404, `There is no ${scope === 'sandbox' ? 'version in your sandbox' : 'shared version'} called "${name}".`);
    if (scope === 'shared' && !force && !row.mine) {
      throw failure(403, `"${name}" is ${sharerOf(row)}'s shared version. Only they, a publisher or the administrator can delete it.`);
    }
    try {
      await pool.query(
        `delete from versions v where v.name = $1 and ${IN(scope).replace('$3', '$2')}`,
        scope === 'sandbox' ? [name, me.id] : [name]);
    } catch (error) {
      if (error.code === '23503') {
        throw failure(409, `"${name}" is the published version. Publish another one before deleting it.`);
      }
      throw error;
    }
  }

  /** Who put a shared version in the open, for a message about it. */
  const sharerOf = (row) => row.updatedBy?.name ?? row.createdBy?.name ?? row.createdBy?.email ?? 'someone else';

  /**
   * A fixed copy of `me`'s sandbox version among the shared ones, under its
   * own name or `as`. A shared version of that name that `me` put there is
   * written over — sharing again is the "I fixed it" path — unless it is the
   * published one, which is refused; one somebody else put there is refused
   * with their name, so `me` shares under another.
   */
  async function share(name, me, by, { as = null } = {}) {
    const draft = await readDraft(name, me);
    if (!draft) throw failure(404, `There is no version "${name}" in your sandbox.`);
    const target = as ?? name;

    const client = await pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query(
        `select v.id, v.shared_by, v.created_by_email, v.created_by_name, v.updated_by_name,
                coalesce(s.published_version_id = v.id, false) as published
           from ${FROM} where v.sandbox_of is null and v.name = $1 for update of v`, [target]);
      const there = rows[0];
      if (!there) {
        await client.query(
          `insert into versions (name, document, sandbox_of, shared_by, created_by_name, created_by_email, updated_by_name, updated_by_email)
           values ($1, $2, null, $3, $4, $5, $4, $5)`,
          [target, draft.document, me.id, by?.name ?? null, by?.email ?? null]);
      } else if (there.published) {
        throw failure(409, `"${target}" is the published version. Share it under another name.`);
      } else if (isMine({ ...there, sandbox_of: null }, me)) {
        await client.query(
          `update versions set document = $2, updated_at = now(), updated_by_name = $3, updated_by_email = $4, shared_by = $5
            where id = $1`,
          [there.id, draft.document, by?.name ?? null, by?.email ?? null, me.id]);
      } else {
        const who = there.updated_by_name ?? there.created_by_name ?? 'someone else';
        throw failure(409, `"${target}" is ${who}'s shared version. Share yours under another name.`);
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return readShared(target, me);
  }

  /** A copy of a shared version in `me`'s sandbox, to work on, under the same name where the sandbox has it free. */
  async function copyToSandbox(name, me, by) {
    const shared = await readShared(name, me);
    if (!shared) throw failure(404, `There is no shared version "${name}".`);
    return createDraft(shared.document, by, me, { name });
  }

  /** Make a shared version the map everyone lands on. Only a shared one: what goes live was in the open first. */
  async function publish(name, me = null) {
    const { rowCount } = await pool.query(
      'update site set published_version_id = v.id from versions v where v.name = $1 and v.sandbox_of is null', [name]);
    if (rowCount === 0) throw failure(404, `There is no shared version "${name}".`);
    return readShared(name, me);
  }

  /**
   * Fill an empty table, once: `load` is asked for `{ name, document,
   * lastModified }`s only when there is nothing here yet, and the newest of
   * them is published. They are shared, as everything site-wide is. Called on
   * the client that holds the migration lock, so two replicas starting
   * together cannot both do it.
   */
  async function importIfEmpty(client, load) {
    const { rows: [{ count }] } = await client.query('select count(*)::int as count from versions');
    if (count > 0) return [];

    const entries = await load();
    if (entries.length === 0) return [];
    const newest = entries.reduce((a, b) => (b.lastModified > a.lastModified ? b : a));

    await client.query('begin');
    try {
      for (const entry of entries) {
        await client.query(
          'insert into versions (name, document, created_at, updated_at) values ($1, $2, $3, $3)',
          [entry.name, entry.document, entry.lastModified]);
      }
      await client.query(
        'update site set published_version_id = v.id from versions v where v.name = $1 and v.sandbox_of is null', [newest.name]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
    return entries.map((entry) => entry.name);
  }

  return {
    listShared, listDrafts, readShared, readDraft, published,
    createDraft, saveDraft, rename, remove, share, copyToSandbox, publish, importIfEmpty,
  };
}
