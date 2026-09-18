// A fresh store is empty, and an empty store means a blank page. This fills it
// once from `seed/`, and then never touches it again, so a restart against a
// real volume leaves real work alone.
//
// `seed/` mirrors the store's key space exactly — `seed/data/icons/gear.svg`
// becomes the object `data/icons/gear.svg` — so what ships as the example map is
// a matter of which files are in that folder, not of anything written here.
// Each folder is filled only when the store has nothing in it yet — counting
// what sits in the folder itself, not what its subfolders hold — so a store
// that has maps but no icons still gets the icons, and one that has maps but no
// settings file still gets the settings file.
//
// Versions are the exception: they live in Postgres, so the server skips their
// folder here and reads it with `readSeedVersions` instead, to fill an empty
// versions table.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

// Only `list` and `write` of the store contract, so a seed lands in whatever
// store the server was given, not only in a directory on disk.

/** Every file under `dir`, as store keys grouped by the prefix they sit in. */
async function groupByPrefix(dir) {
  const groups = new Map();

  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const key = relative(dir, full).split(sep).join('/');
        const prefix = key.slice(0, key.lastIndexOf('/') + 1);
        groups.set(prefix, [...(groups.get(prefix) ?? []), { key, path: full }]);
      }
    }
  }

  try {
    await walk(dir);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return groups;
}

/** What the store holds directly in `prefix`, ignoring the folders below it. */
async function directlyUnder(store, prefix) {
  const objects = await store.list(prefix);
  return objects.filter((object) => !object.key.slice(prefix.length).includes('/'));
}

/** `skip` names prefixes this store does not hold, such as the versions in Postgres. */
export async function seedStore(store, seedDir, { skip = [] } = {}) {
  const seeded = [];

  for (const [prefix, files] of await groupByPrefix(seedDir)) {
    if (skip.some((skipped) => prefix.startsWith(skipped))) continue;
    if ((await directlyUnder(store, prefix)).length > 0) continue;
    for (const file of files) {
      await store.write(file.key, await readFile(file.path));
    }
    seeded.push(`${files.length} file${files.length === 1 ? '' : 's'} under ${prefix}`);
  }

  return seeded;
}

/**
 * The `.json` files directly in `prefix` under `seedDir`, as `{ name, document,
 * lastModified }` with the name being the file's, less `.json`.
 */
export async function readSeedVersions(seedDir, prefix) {
  const dir = join(seedDir, ...prefix.split('/').filter(Boolean));
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const versions = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const path = join(dir, entry.name);
    const [document, info] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
    versions.push({ name: entry.name.slice(0, -'.json'.length), document, lastModified: info.mtime });
  }
  return versions;
}
