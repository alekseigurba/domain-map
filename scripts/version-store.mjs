// The versions of the map, and which one is published. Every call is one
// statement or one transaction, so what it answers is what the database holds.
//
// A failure a person can do something about carries an HTTP status, and the
// server passes it on as it is: 404 for a version that is not there, 409 for one
// that changed or cannot be deleted.

const COLUMNS = `v.name, v.created_at, v.created_by_name, v.created_by_email,
  v.updated_at, v.updated_by_name, v.updated_by_email,
  coalesce(s.published_version_id = v.id, false) as published`;

/** One row per version, with the site row beside it to tell which is published. */
const FROM = 'versions v cross join site s';

const failure = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

const person = (name, email) => (name || email ? { name: name ?? null, email: email ?? null } : null);

function toVersion(row) {
  return {
    name: row.name,
    createdAt: row.created_at.toISOString(),
    createdBy: person(row.created_by_name, row.created_by_email),
    updatedAt: row.updated_at.toISOString(),
    updatedBy: person(row.updated_by_name, row.updated_by_email),
    published: row.published,
    ...(row.document !== undefined && { document: row.document }),
  };
}

/** `v1`, `v2`, `v3`: the names this server gives. A version imported from a file keeps its own. */
const NUMBERED = /^v(\d+)$/;

export function versionStore(pool) {
  /** Every version, without its document: newest first, and in an order a save does not reshuffle. */
  async function list() {
    const { rows } = await pool.query(`select ${COLUMNS} from ${FROM} order by v.created_at desc, v.name desc`);
    return rows.map(toVersion);
  }

  async function read(name) {
    const { rows } = await pool.query(`select ${COLUMNS}, v.document from ${FROM} where v.name = $1`, [name]);
    return rows[0] ? toVersion(rows[0]) : null;
  }

  async function published() {
    const { rows } = await pool.query(
      `select ${COLUMNS}, v.document from versions v join site s on s.published_version_id = v.id`);
    return rows[0] ? toVersion(rows[0]) : null;
  }

  /**
   * A new version, one past the highest number here: `v1`, `v2`, `v3`. Names
   * that are not numbers — a version imported from a file — are counted out, so
   * they neither hold a number back nor take one. Two owners saving at once can
   * reach for the same number, and the unique name decides which of them gets
   * it; the other takes the next one.
   */
  async function create(document, by) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { rows: taken } = await pool.query("select name from versions where name ~ '^v[0-9]+$'");
      const highest = Math.max(0, ...taken.map(({ name }) => Number(NUMBERED.exec(name)[1])));
      const { rows } = await pool.query(
        `insert into versions (name, document, created_by_name, created_by_email, updated_by_name, updated_by_email)
         values ($1, $2, $3, $4, $3, $4)
         on conflict (name) do nothing
         returning name`,
        [`v${highest + 1}`, document, by?.name ?? null, by?.email ?? null]);
      if (rows[0]) return read(rows[0].name);
    }
    throw failure(409, 'Could not find a free name for the new version. Try again.');
  }

  /**
   * Write over a version, but only the one the client opened: `base` is the
   * `updatedAt` it was given, and a version saved by anyone since then is left
   * alone. The 409 carries the version as it is now, so the client can say who.
   */
  async function save(name, document, base, by) {
    const { rows } = await pool.query(
      `update versions
          set document = $2, updated_at = now(), updated_by_name = $4, updated_by_email = $5
        where name = $1 and updated_at = $3
        returning name`,
      [name, document, base, by?.name ?? null, by?.email ?? null]);
    if (rows[0]) return read(name);

    const now = await read(name);
    if (!now) throw failure(404, `There is no version "${name}".`);
    const { document: _, ...version } = now;
    throw failure(409, `"${name}" has been saved since you opened it.`, { version });
  }

  async function remove(name) {
    let deleted;
    try {
      ({ rowCount: deleted } = await pool.query('delete from versions where name = $1', [name]));
    } catch (error) {
      // The site row's foreign key: the published version cannot go.
      if (error.code === '23503') {
        throw failure(409, `"${name}" is the published version. Publish another one before deleting it.`);
      }
      throw error;
    }
    if (deleted === 0) throw failure(404, `There is no version "${name}".`);
  }

  async function publish(name) {
    const { rowCount } = await pool.query(
      'update site set published_version_id = v.id from versions v where v.name = $1', [name]);
    if (rowCount === 0) throw failure(404, `There is no version "${name}".`);
    return read(name);
  }

  /**
   * Fill an empty table, once: `load` is asked for `{ name, document,
   * lastModified }`s only when there is nothing here yet, and the newest of
   * them is published. Called on the client that holds the migration lock, so
   * two replicas starting together cannot both do it.
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
        'update site set published_version_id = v.id from versions v where v.name = $1', [newest.name]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
    return entries.map((entry) => entry.name);
  }

  return { list, read, published, create, save, remove, publish, importIfEmpty };
}
