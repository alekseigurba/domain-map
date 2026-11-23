// Groups: a name and its members, kept beside the people list. A group is the
// app's own — put together by an administrator in Users & access, from people
// who are on the list already — and is what a shared version is shared with
// when it is not shared with everyone. Nothing here knows about the groups of
// whoever signs people in.
//
// Every call is one statement or one transaction, as the people store's are. A
// failure a person can do something about carries an HTTP status: 404 for a
// group or a person that is not there, 409 for a name already taken, 400 for a
// name that is not one.

const failure = (status, message) => Object.assign(new Error(message), { status });

/** A group's name is read in a list and on a chip: a few words. */
const MAX_NAME_LENGTH = 80;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOr = (value) => (UUID.test(value ?? '') ? value : null);

function checkedName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) throw failure(400, `A group's name is 1..${MAX_NAME_LENGTH} characters.`);
  return name;
}

/** A group with who is in it, by name. */
const WITH_MEMBERS = `select g.id, g.name, g.created_at,
    coalesce((select json_agg(json_build_object('id', p.id, 'name', p.name, 'email', p.email) order by lower(p.name), p.created_at)
                from group_members m join people p on p.id = m.person_id
               where m.group_id = g.id), '[]') as members
  from groups g`;

const toGroup = (row) => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at.toISOString(),
  members: row.members,
});

export function groupStore(pool) {
  /** Every group, by name, each with its members. */
  async function list() {
    const { rows } = await pool.query(`${WITH_MEMBERS} order by lower(g.name)`);
    return rows.map(toGroup);
  }

  async function read(id) {
    const { rows } = await pool.query(`${WITH_MEMBERS} where g.id = $1`, [idOr(id)]);
    return rows[0] ? toGroup(rows[0]) : null;
  }

  /** The group, or a 404 that says so. */
  async function found(id) {
    const group = await read(id);
    if (!group) throw failure(404, 'There is no such group.');
    return group;
  }

  const taken = (name) => failure(409, `There is already a group called "${name}".`);

  async function create(name) {
    const called = checkedName(name);
    try {
      const { rows } = await pool.query('insert into groups (name) values ($1) returning id', [called]);
      return read(rows[0].id);
    } catch (error) {
      if (error.code === '23505') throw taken(called);
      throw error;
    }
  }

  async function rename(id, name) {
    const called = checkedName(name);
    await found(id);
    try {
      await pool.query('update groups set name = $2 where id = $1', [id, called]);
    } catch (error) {
      if (error.code === '23505') throw taken(called);
      throw error;
    }
    return read(id);
  }

  /**
   * Delete a group. Whatever was shared with it is no longer shared with its
   * members through it — and is not thereby shared with everyone: a version's
   * being restricted is its own to say, and stays said.
   */
  async function remove(id) {
    await found(id);
    await pool.query('delete from groups where id = $1', [id]);
  }

  /** Put someone in a group. Asked twice, they are in it once. */
  async function addMember(id, personId) {
    await found(id);
    try {
      await pool.query(
        'insert into group_members (group_id, person_id) values ($1, $2) on conflict do nothing', [id, idOr(personId)]);
    } catch (error) {
      // No such person, or an id that is not one: the foreign key and the not-null say so.
      if (error.code === '23503' || error.code === '23502') throw failure(404, 'There is no such person.');
      throw error;
    }
    return read(id);
  }

  /** Take someone out of a group. Someone who was not in it is not in it still. */
  async function removeMember(id, personId) {
    await found(id);
    await pool.query('delete from group_members where group_id = $1 and person_id = $2', [id, idOr(personId)]);
    return read(id);
  }

  return { list, read, create, rename, remove, addMember, removeMember };
}
