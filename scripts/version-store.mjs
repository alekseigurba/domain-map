// The versions of the map: each in somebody's sandbox or shared, and one of
// the shared ones published. A sandbox is one person's — what they save is
// theirs until they share it, and nobody else, not a publisher, not the
// administrator, is shown what is in it. Shared is what every contributor
// sees: fixed copies put in the open, never edited in place. To change one, a
// contributor takes a copy into their sandbox, works, and shares again. What
// was here before sandboxes was site-wide, and is shared.
//
// A shared version may be shared with fewer than everyone: with the people and
// the groups named for it. It is then seen by them, by whoever shared it, and
// by the administrators, who run the list and would otherwise be left unable
// to tidy up after someone who has gone. To everyone else it is not there —
// not in the list, not at its name — and every way in here asks who is looking
// before it answers. The published version is the one exception that proves
// it: it is everyone's by definition, so it is never restricted.
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

const COLUMNS = `v.id, v.name, v.created_at, v.created_by_name, v.created_by_email,
  v.updated_at, v.updated_by_name, v.updated_by_email, v.sandbox_of, v.shared_by, v.restricted,
  coalesce(s.published_version_id = v.id, false) as published,
  coalesce((select json_agg(json_build_object('id', p.id, 'name', p.name) order by lower(p.name), p.created_at)
              from version_people vp join people p on p.id = vp.person_id
             where vp.version_id = v.id), '[]') as audience_people,
  coalesce((select json_agg(json_build_object('id', g.id, 'name', g.name) order by lower(g.name))
              from version_groups vg join groups g on g.id = vg.group_id
             where vg.version_id = v.id), '[]') as audience_groups`;

/**
 * Whether a shared version is this person's to see, as a where clause over
 * three parameters: who they are, the address they are known by, and whether
 * they see everything, as an administrator does. One that is not restricted is
 * everyone's. A restricted one is its sharer's — by id, or for a version from
 * before sandboxes by the address that saved it, as `isMine` has it — and
 * that of anyone named for it, themselves or through a group they are in.
 */
const SEEN = (me, email, all) => `(not v.restricted
    or ${all}::boolean
    or v.shared_by = ${me}::uuid
    or (v.shared_by is null and v.created_by_email is not null and lower(v.created_by_email) = lower(${email}::text))
    or exists (select 1 from version_people vp where vp.version_id = v.id and vp.person_id = ${me}::uuid)
    or exists (select 1 from version_groups vg join group_members gm on gm.group_id = vg.group_id
                where vg.version_id = v.id and gm.person_id = ${me}::uuid))`;

/** Who is looking, as the three parameters SEEN takes. */
const looking = (me, all) => [me?.id ?? null, me?.email ?? null, all === true];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** More names than this on one version is a group that has not been made yet. */
const MAX_AUDIENCE = 500;

/**
 * Who a version is to be shared with, as asked for and checked:
 * `{ restricted, people, groups }`, the two lists as ids without repeats.
 * `{ everyone: true }` is everyone; `{ people, groups }` is those and nobody
 * else, and may name nobody at all — a version pulled back to its sharer.
 */
export function checkedAudience(value) {
  const wrong = () => failure(400, 'Say who it is shared with: { "everyone": true }, or the ids of the people and the groups.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw wrong();
  if (value.everyone === true) return { restricted: false, people: [], groups: [] };
  const ids = (list) => {
    if (list === undefined) return [];
    if (!Array.isArray(list) || list.length > MAX_AUDIENCE || !list.every((id) => UUID.test(id ?? ''))) throw wrong();
    return [...new Set(list.map((id) => id.toLowerCase()))];
  };
  if (value.people === undefined && value.groups === undefined) throw wrong();
  return { restricted: true, people: ids(value.people), groups: ids(value.groups) };
}

/** Write who a shared version is shared with, in the transaction `client` holds. */
async function writeAudience(client, versionId, audience) {
  await client.query('update versions set restricted = $2 where id = $1', [versionId, audience.restricted]);
  await client.query('delete from version_people where version_id = $1', [versionId]);
  await client.query('delete from version_groups where version_id = $1', [versionId]);
  try {
    await client.query('insert into version_people (version_id, person_id) select $1, unnest($2::uuid[])', [versionId, audience.people]);
    await client.query('insert into version_groups (version_id, group_id) select $1, unnest($2::uuid[])', [versionId, audience.groups]);
  } catch (error) {
    // Somebody named was taken off the list, or a group deleted, since the choice was put together.
    if (error.code === '23503') throw failure(409, 'Someone, or a group, named there is no longer on the list. Choose again.');
    throw error;
  }
}

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
    // Who a shared version is shared with: null for everyone, or the people
    // and the groups named for it. Only someone it is shared with is ever
    // handed a row, so saying who else is on it tells them nothing they could
    // not see by asking each other.
    audience: row.restricted ? { people: row.audience_people ?? [], groups: row.audience_groups ?? [] } : null,
    ...(row.document !== undefined && { document: row.document }),
  };
}

/** `v1`, `v2`, `v3`: the names a sandbox gives. A version imported from a file keeps its own. */
const NUMBERED = /^v(\d+)$/;

export function versionStore(pool) {
  /**
   * Every shared version `me` may see, without its document: newest first, and
   * in an order a save does not reshuffle. `all` is an administrator looking,
   * who sees the restricted ones too.
   */
  async function listShared(me, { all = false } = {}) {
    const { rows } = await pool.query(
      `select ${COLUMNS} from ${FROM} where v.sandbox_of is null and ${SEEN('$1', '$2', '$3')}
        order by v.created_at desc, v.name desc`, looking(me, all));
    return rows.map((row) => toVersion(row, me));
  }

  /** Every version in `me`'s sandbox, without its document. */
  async function listDrafts(me) {
    const { rows } = await pool.query(
      `select ${COLUMNS} from ${FROM} where v.sandbox_of = $1 order by v.created_at desc, v.name desc`, [me.id]);
    return rows.map((row) => toVersion(row, me));
  }

  /** The shared version of this name as the database has it, if `me` may see it: the row, with its id. */
  async function sharedRow(name, me, all) {
    const { rows } = await pool.query(
      `select ${COLUMNS}, v.document from ${FROM} where v.sandbox_of is null and v.name = $1 and ${SEEN('$2', '$3', '$4')}`,
      [name, ...looking(me, all)]);
    return rows[0] ?? null;
  }

  /** A shared version with its document, or null: one that is not there, and one that is not `me`'s to see, alike. */
  async function readShared(name, me = null, { all = false } = {}) {
    const row = await sharedRow(name, me, all);
    return row ? toVersion(row, me) : null;
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
  async function rename(scope, from, to, me, { force = false, all = false } = {}) {
    const row = scope === 'sandbox' ? await readDraft(from, me) : await readShared(from, me, { all });
    if (!row) throw failure(404, `There is no ${scope === 'sandbox' ? 'version in your sandbox' : 'shared version'} called "${from}".`);
    if (scope === 'shared' && !force && !row.mine) {
      throw failure(403, `"${from}" is ${sharerOf(row)}'s shared version. Only they, a publisher or an administrator can rename it.`);
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
    return scope === 'sandbox' ? readDraft(to, me) : readShared(to, me, { all });
  }

  /** Delete a version for good. The published one cannot go: the site row's foreign key says so. */
  async function remove(scope, name, me, { force = false, all = false } = {}) {
    const row = scope === 'sandbox' ? await readDraft(name, me) : await readShared(name, me, { all });
    if (!row) throw failure(404, `There is no ${scope === 'sandbox' ? 'version in your sandbox' : 'shared version'} called "${name}".`);
    if (scope === 'shared' && !force && !row.mine) {
      throw failure(403, `"${name}" is ${sharerOf(row)}'s shared version. Only they, a publisher or an administrator can delete it.`);
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
   *
   * `audience` says who it is shared with, as `checkedAudience` answers. Left
   * out, a version shared for the first time is everyone's, as it always was —
   * and one shared again keeps whoever it was shared with. A fix to a version
   * three people were shown must not, by being shared, become a version the
   * whole list is shown.
   */
  async function share(name, me, by, { as = null, audience = null, all = false } = {}) {
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
      let id;
      if (!there) {
        ({ rows: [{ id }] } = await client.query(
          `insert into versions (name, document, sandbox_of, shared_by, created_by_name, created_by_email, updated_by_name, updated_by_email)
           values ($1, $2, null, $3, $4, $5, $4, $5) returning id`,
          [target, draft.document, me.id, by?.name ?? null, by?.email ?? null]));
      } else if (there.published) {
        throw failure(409, `"${target}" is the published version. Share it under another name.`);
      } else if (isMine({ ...there, sandbox_of: null }, me)) {
        ({ id } = there);
        await client.query(
          `update versions set document = $2, updated_at = now(), updated_by_name = $3, updated_by_email = $4, shared_by = $5
            where id = $1`,
          [id, draft.document, by?.name ?? null, by?.email ?? null, me.id]);
      } else {
        const who = there.updated_by_name ?? there.created_by_name ?? 'someone else';
        throw failure(409, `"${target}" is ${who}'s shared version. Share yours under another name.`);
      }
      if (audience) await writeAudience(client, id, audience);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return readShared(target, me, { all });
  }

  /**
   * Say who a shared version is shared with: everyone, or the people and the
   * groups named. Whoever shared it may, and an administrator; a publisher may
   * rename and delete what anyone shared, but who a version is shown to is its
   * sharer's to say. The published version stays everyone's.
   *
   * It is done holding the site row, as publishing is, so that a version
   * cannot be restricted and published in the same moment by two people who
   * each saw it as it was.
   */
  async function setAudience(name, me, audience, { all = false } = {}) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const { rows: [site] } = await client.query('select published_version_id from site for update');
      const row = await sharedRow(name, me, all);
      if (!row) throw failure(404, `There is no shared version "${name}".`);
      if (!all && !isMine(row, me)) {
        throw failure(403, `"${name}" is ${sharerOf(toVersion(row, me))}'s shared version. Only they or an administrator can say who it is shared with.`);
      }
      if (audience.restricted && site?.published_version_id === row.id) {
        throw failure(409, `"${name}" is the published version, which everyone sees. Publish another before sharing this one with fewer people.`);
      }
      await writeAudience(client, row.id, audience);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return readShared(name, me, { all });
  }

  /** A copy of a shared version in `me`'s sandbox, to work on, under the same name where the sandbox has it free. */
  async function copyToSandbox(name, me, by, { all = false } = {}) {
    const shared = await readShared(name, me, { all });
    if (!shared) throw failure(404, `There is no shared version "${name}".`);
    return createDraft(shared.document, by, me, { name });
  }

  /**
   * Make a shared version the map everyone lands on. Only a shared one: what
   * goes live was in the open first. And only one shared with everyone: the
   * published map is everyone's, so a version three people were shown is
   * opened to the rest by its sharer before it is published, not by the
   * publishing of it.
   */
  async function publish(name, me = null, { all = false } = {}) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('select published_version_id from site for update');
      const row = await sharedRow(name, me, all);
      if (!row) throw failure(404, `There is no shared version "${name}".`);
      if (row.restricted) {
        throw failure(409, `"${name}" is shared with selected people. Share it with everyone before publishing it.`);
      }
      await client.query('update site set published_version_id = $1', [row.id]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return readShared(name, me, { all });
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
    createDraft, saveDraft, rename, remove, share, setAudience, copyToSandbox, publish, importIfEmpty,
  };
}
