// A generic file store: get/put/list by key, nothing else. This is the whole
// contract the frontend depends on, so it stays swappable for something like
// S3 later without either side changing shape — a key is a path, an object is
// bytes, a listing is `{ key, size, lastModified }`.

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

/** A key can only ever resolve inside the store — no `..`, no drive letters. */
function resolveKey(storageDir, key) {
  const filePath = resolve(join(storageDir, key));
  if (filePath !== storageDir && !filePath.startsWith(storageDir + sep)) {
    throw new Error(`Key escapes the store: ${key}`);
  }
  return filePath;
}

/** The object at `key`, or null if there is none. */
export async function readObject(storageDir, key) {
  const filePath = resolveKey(storageDir, key);
  try {
    const [body, info] = await Promise.all([readFile(filePath), stat(filePath)]);
    return { body, lastModified: info.mtime.toISOString() };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write `body` to `key`, creating whatever directories it needs. */
export async function writeObject(storageDir, key, body) {
  const filePath = resolveKey(storageDir, key);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, body);
  const info = await stat(filePath);
  return { key, size: info.size, lastModified: info.mtime.toISOString() };
}

/** Every object under `prefix`, recursively — forward-slash keys, sorted. */
export async function listObjects(storageDir, prefix = '') {
  const startDir = resolveKey(storageDir, prefix);
  const objects = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const info = await stat(full);
        objects.push({
          key: relative(storageDir, full).split(sep).join('/'),
          size: info.size,
          lastModified: info.mtime.toISOString(),
        });
      }
    }
  }

  await walk(startDir);
  objects.sort((a, b) => a.key.localeCompare(b.key));
  return objects;
}
