#!/usr/bin/env node
// Writes a consumer repo: one that installs this package and supplies its own
// brand and its own starting map, rather than forking it.
//
// The bin name is not the package name, so npx has to be told which package it
// lives in — `npx create-domain-map-app` alone would look for a package of that
// name on the npm registry, and there is none:
//
//   npx --package=github:OWNER/REPO create-domain-map-app acme-domain-map
//   npx --package=git+ssh://git@github.com/OWNER/REPO.git create-domain-map-app acme  # private
//
// What it writes is deliberately small — a ten-line server, a stylesheet of
// token overrides, and a seed folder — because that is the whole of what a
// consumer owns. Everything else stays in the package and upgrades with it.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);

/** This package's own source, so the specs below name a repo rather than a blank. */
const source = (() => {
  const match = (packageJson.repository?.url ?? '').match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  return match ? { owner: match[1], repo: match[2] } : null;
})();

/** How a consumer installs this package at `tag`, over https or, for a private repo, ssh. */
function installSpec(tag, ssh) {
  // The `github:` shorthand resolves to an unauthenticated https URL, which a
  // private repo refuses. SSH uses whatever key the developer already pushes
  // with, so `--ssh` is the flag to pass when the source repo is private.
  return ssh
    ? `git+ssh://git@github.com/${source.owner}/${source.repo}.git#${tag}`
    : `github:${source.owner}/${source.repo}#${tag}`;
}

/** Where a consumer's package.json should point to get this exact version. */
function dependencySpec() {
  if (!source) return `^${packageJson.version}`;
  // A git tag, not a registry range: there is no build step, so npm can install
  // straight from the tag, and a consumer gets a version they pinned on purpose.
  return installSpec(`v${packageJson.version}`, flags.ssh);
}

// `--title` and `--color` take a value; `--force` does not. Walking the list
// rather than scanning it keeps a flag's value from being read as the directory.
const VALUED = new Set(['--title', '--color']);
const flags = {};
const positional = [];
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (VALUED.has(arg)) flags[arg.slice(2)] = process.argv[++i];
  else if (arg.startsWith('--')) flags[arg.slice(2)] = true;
  else positional.push(arg);
}

const flag = (name) => (typeof flags[name] === 'string' ? flags[name] : null);
const target = positional[0];
if (!target) {
  console.error('Usage: create-domain-map-app <directory> [--title "Acme domain map"] [--color "#7b2d8e"] [--ssh] [--force]');
  process.exit(1);
}

const dir = resolve(target);
const slug = target.split('/').filter(Boolean).pop().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
const title = flag('title') ?? 'Acme domain map';
const brandColor = flag('color') ?? '#7b2d8e';
const force = flags.force === true;

// A scaffold that lands on top of someone's work is worse than one that refuses.
try {
  const existing = await readdir(dir);
  if (existing.length > 0 && !force) {
    console.error(`${dir} is not empty. Pass --force to write into it anyway.`);
    process.exit(1);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

// --- what gets written --------------------------------------------------------

// The upgrade command the consumer's README carries. This package's real owner
// and repo at the version being scaffolded from, so it is something to run
// rather than a template to fill in.
const upgradeExample = source
  ? `npm install domain-map@${installSpec(`v${packageJson.version}`, false)}
# or, if that repo is private:
npm install domain-map@${installSpec(`v${packageJson.version}`, true)}`
  : `npm install domain-map@^${packageJson.version}`;

// Every file a scaffolded repo starts with is a real file in the package rather
// than a template literal in here, so each one can be read and edited as the
// file it will become. Two directories feed it: scaffold/, the repo's own
// skeleton, and the package's seed/, which is the starting map itself.
const SCAFFOLD_DIR = new URL('../scaffold/', import.meta.url);
const SEED_DIR = new URL('../seed/', import.meta.url);

// npm rewrites a packed `.gitignore` to `.npmignore`, and a dotted name would
// also apply to this repo's own git rather than waiting to be copied. They are
// stored undotted and get their dot on the way out.
const DOTTED = { gitignore: '.gitignore', dockerignore: '.dockerignore' };

/** The colour the package's own seed art is drawn in — its default --r-brand-400. */
const SEED_BRAND_COLOR = /#527a42/gi;

const values = {
  title,
  slug,
  brandColor,
  // JSON files take the quoted form, so a title with a quote in it stays valid.
  titleJson: JSON.stringify(title),
  dependencySpecJson: JSON.stringify(dependencySpec()),
  upgradeExample,
  packageUrl: packageJson.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') ?? 'domain-map',
};

/** `{{name}}` → its value. An unknown name is a broken template, not a blank. */
function fill(text, path) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (!(name in values)) throw new Error(`scaffold/${path}: no value for {{${name}}}`);
    return values[name];
  });
}

/** Every file under `dir`, as text, keyed by its path relative to it. */
async function walk(dir, prefix = '') {
  const out = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue; // .DS_Store and anything like it
    const at = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, dir);
    if (entry.isDirectory()) Object.assign(out, await walk(at, `${prefix}${entry.name}/`));
    else out[prefix + entry.name] = await readFile(at, 'utf8');
  }
  return out;
}

const { fromDocument, toDocument, stringify } = await import('../app/js/document.js');

/**
 * The package's own seed, made this repo's own: the same settings, the same
 * logo, the same icons and the same example map, rather than a second set
 * written out here that would drift from what the package actually ships.
 *
 * Three things are answered to the flags on the way through. A map's `palette`
 * is dropped, because a map without one reads --c1 … --c24 back out of the
 * stylesheet, which is what lets brand.css recolour it; it is round-tripped
 * through the app's own reader and writer at the same time, so the file matches
 * what a save writes and a consumer's first save is not a diff of the whole map.
 * The art is drawn in the package's default green, so that one colour becomes
 * --color. And the title is the one thing here that is a name rather than
 * content, so --title replaces it.
 */
function asSeed(path, text) {
  if (/^data\/versions\/.+\.json$/.test(path)) {
    return `${stringify(toDocument(fromDocument({ ...JSON.parse(text), palette: null })))}\n`;
  }
  if (path === 'data/settings.json') {
    return `${JSON.stringify({ ...JSON.parse(text), logoAlt: title, title }, null, 2)}\n`;
  }
  if (path.endsWith('.svg')) return text.replace(SEED_BRAND_COLOR, brandColor);
  return text;
}

const files = {
  ...Object.fromEntries(
    Object.entries(await walk(SCAFFOLD_DIR))
      .map(([path, text]) => [
        path.replace(/(^|\/)([^/]+)$/, (_, dir, name) => dir + (DOTTED[name] ?? name)),
        fill(text, path),
      ]),
  ),
  ...Object.fromEntries(
    Object.entries(await walk(SEED_DIR))
      .map(([path, text]) => [`seed/${path}`, asSeed(path, text)]),
  ),
};

// --- write it out -------------------------------------------------------------

for (const [path, contents] of Object.entries(files)) {
  const full = join(dir, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, contents);
}

console.log(`Wrote ${Object.keys(files).length} files to ${dir}\n`);
console.log('Next:');
console.log(`  cd ${target}`);
console.log('  git init && git add -A && git commit -m "Scaffold from domain-map"');
console.log('  npm install');
console.log('  npm run db          # Postgres, where the versions of the map live');
console.log('  npm run start:dev\n');
console.log(`Then edit brand/css/brand.css and seed/data/settings.json to make it yours.`);
