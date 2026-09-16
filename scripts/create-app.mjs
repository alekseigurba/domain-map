#!/usr/bin/env node
// Writes a consumer repo: one that installs this package and supplies its own
// brand and its own starting map, rather than forking it.
//
//   npx create-domain-map-app acme-domain-map --title "Acme domain map"
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

/** Where a consumer's package.json should point to get this exact version. */
function dependencySpec() {
  const url = packageJson.repository?.url ?? '';
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  // A git tag, not a registry range: there is no build step, so npm can install
  // straight from the tag, and a consumer gets a version they pinned on purpose.
  return match
    ? `github:${match[1]}/${match[2]}#v${packageJson.version}`
    : `^${packageJson.version}`;
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
  console.error('Usage: create-domain-map-app <directory> [--title "Acme domain map"] [--color "#7b2d8e"] [--force]');
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

const files = {
  'package.json': `${JSON.stringify({
    name: slug,
    version: '0.1.0',
    private: true,
    type: 'module',
    engines: { node: '>=22' },
    scripts: {
      start: 'node server.mjs',
      'start:dev': 'node --env-file=dev.env server.mjs',
    },
    dependencies: { 'domain-map': dependencySpec() },
  }, null, 2)}\n`,

  'server.mjs': `// The whole integration. Everything else in this repo is content: what the map
// looks like (brand/) and what it starts life as (seed/).
import { createDomainMapServer } from 'domain-map';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

const server = createDomainMapServer({
  // Files here shadow the package's own, so anything under its app/ can be
  // replaced without forking. BRANDING.md in the package says which files are
  // supported; everything else there is internal and may move between versions.
  brandDir: here('brand'),
  // Replaces the package's example map outright, rather than merging with it.
  seedDir: here('seed'),
});

const port = Number(process.env.PORT ?? 8000);
server.listen(port, () => console.log(\`${title} on http://localhost:\${port}\`));
`,

  'brand/css/brand.css': `/* The visual rebrand, entire. This is the last stylesheet the app loads, so
   anything redefined here wins over the package's tokens.

   The map's shape colours are --c1 … --c24, read back out of the stylesheet by
   the app itself, so they rebrand along with the chrome. The seed map below
   deliberately carries no palette of its own, which is what lets it follow
   these. Once someone edits the palette in the app, that map keeps its own copy
   and stops following them. */

:root {
  /* The brand colour, wherever the chrome asks for one. */
  --r-vanguard-400: ${brandColor};
  --r-vanguard-300: ${brandColor};
  --r-vanguard-200: #e5dcea;

  /* The map's own fills. Replace all 24 to own the palette outright; the ones
     left alone keep the package's. */
  --c1: ${brandColor};
}

/* A typeface of your own: drop the woff2 files in brand/fonts/, declare them
   here, and name them. The package serves /fonts/ before sign-in, so the
   sign-in page gets them too.

@font-face {
  font-family: 'Acme Grotesk';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('../fonts/acme-grotesk-400.woff2') format('woff2');
}

:root {
  --font-heading: 'Acme Grotesk';
  --font-text: 'Acme Grotesk';
}
*/
`,

  'brand/favicon.svg': favicon(brandColor),

  // `seed/` mirrors the store's key space exactly: seed/data/x becomes the
  // object data/x. It fills a fresh store once and is never consulted again, so
  // editing these files does not disturb a map anyone has worked on.
  'seed/data/settings.json': `${JSON.stringify({
    logo: null,
    logoSrc: 'api/files/data/brand/logo.svg',
    logoAlt: title,
    title,
    footer: 'Maintained by the architecture team',
  }, null, 2)}\n`,

  'seed/data/brand/logo.svg': logo(brandColor),

  [`seed/data/versions/${slug}.json`]: `${JSON.stringify(starterMap(title), null, 2)}\n`,

  'dev.env': `# What \`npm run start:dev\` runs with: sign-in switched off, so every page and
# every API call goes straight through. Drop AUTH_ENABLED to bring the gate
# back. For Microsoft sign-in, set AUTH_TENANT_ID, AUTH_CLIENT_ID,
# AUTH_CLIENT_SECRET and AUTH_SESSION_SECRET instead.
AUTH_ENABLED=false
NODE_ENV=development
AUTH_DEV_BYPASS=true
STORAGE_DIR=storage
`,

  Dockerfile: `FROM node:22-alpine

WORKDIR /srv

# The package installs from a git tag, so git has to be here for \`npm ci\`.
RUN apk add --no-cache git

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Only what this repo owns. The app itself comes from node_modules.
COPY server.mjs ./
COPY brand ./brand
COPY seed ./seed

ENV NODE_ENV=production
ENV STORAGE_DIR=/store
ENV PORT=8000

EXPOSE 8000
VOLUME ["/store/data"]

CMD ["node", "server.mjs"]
`,

  'docker-compose.yml': `services:
  ${slug}:
    build: .
    ports:
      - "8000:8000"
    environment:
      STORAGE_DIR: /store
      PORT: 8000
      # Sign-in is off in this stack. Drop these three and set AUTH_TENANT_ID,
      # AUTH_CLIENT_ID, AUTH_CLIENT_SECRET and AUTH_SESSION_SECRET for Entra ID.
      AUTH_ENABLED: "false"
      NODE_ENV: development
      AUTH_DEV_BYPASS: "true"
    # Everything the app stores sits under one folder, so one volume holds the
    # maps, the version history and the uploaded icons.
    volumes:
      - ${slug}-data:/store/data
    restart: unless-stopped

volumes:
  ${slug}-data:
`,

  '.dockerignore': `node_modules\nstorage\n.git\n`,

  '.gitignore': `node_modules\n.env\n.DS_Store\n# The live file store. Rebuilt from seed/ on the next start.\n/storage/\n`,

  'README.md': `# ${title}

Built on [domain-map](${packageJson.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') ?? 'domain-map'}), installed as a package. This repo holds only what is ours: the branding and the starting map.

\`\`\`bash
npm install
npm run start:dev
\`\`\`

Then open <http://localhost:8000>.

## What is in here

| Path | What it is |
| --- | --- |
| \`server.mjs\` | The whole integration — ten lines that point the package at the two folders below. |
| \`brand/css/brand.css\` | Token overrides: colours, typeface, the map's 24 shape fills. |
| \`brand/favicon.svg\` | The tab icon. Any file under \`brand/\` shadows the package's copy of it. |
| \`seed/data/settings.json\` | Header logo, page title and footer text. |
| \`seed/data/versions/\` | The map a fresh store starts with. |

\`seed/\` fills an empty store **once**. After that the store is the source of truth, so editing these files does not change a map anyone has worked on — that is deliberate. To start over, delete the store (\`rm -rf storage\`, or \`docker compose down -v\`).

## Upgrading

\`\`\`bash
npm install domain-map@github:OWNER/REPO#v1.1.0
\`\`\`

Read the package's BRANDING.md first. Files under \`brand/\` that are not on its supported list — anything in \`brand/js/\`, in particular — can break on an upgrade, because they shadow the app's internals.
`,
};

// --- the starter content ------------------------------------------------------

function favicon(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="${color}"/>
  <circle cx="16" cy="16" r="7" fill="none" stroke="#fff" stroke-width="2.5"/>
  <circle cx="16" cy="16" r="2.5" fill="#fff"/>
</svg>
`;
}

function logo(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" role="img">
  <circle cx="20" cy="20" r="18" fill="${color}" opacity="0.15"/>
  <circle cx="20" cy="20" r="9" fill="none" stroke="${color}" stroke-width="3"/>
  <circle cx="20" cy="20" r="3" fill="${color}"/>
</svg>
`;
}

/**
 * Two domains and the capabilities in them — enough to show what the map is for
 * and to be worth deleting. No `palette`, on purpose: a map without one follows
 * the stylesheet, so this one wears brand.css until someone edits its colours.
 */
function starterMap(mapTitle) {
  const domain = (key, name, position, color) => ({
    key,
    title: name,
    shape: { position, titlePosition: '0,-210', color, size: 48, weight: 'regular', titleScale: 1, opacity: 20 },
  });
  const capability = (key, parent, name, position, color, description) => ({
    key,
    domain: parent,
    title: name,
    description,
    shape: { position, color, size: 32, weight: 'regular', scale: 1, stretch: 2, order: 0 },
  });

  return {
    version: 1,
    title: mapTitle,
    domains: [
      domain('customer', 'Customer', '0,0', 1),
      domain('operations', 'Operations', '1000,0', 2),
    ],
    capabilities: [
      // A key is the slug of the title: the app derives it that way when a map is
      // loaded, so a seed that disagrees gets quietly rewritten on the first save.
      capability('identity-access', 'customer', 'Identity & access', '-150,-60', 1,
        'Who someone is, and what they are allowed to do.'),
      capability('customer-profile', 'customer', 'Customer profile', '160,60', 1,
        'What we know about a customer, and who may change it.'),
      capability('fulfilment', 'operations', 'Fulfilment', '-150,-60', 2,
        'Getting what was promised to the person who was promised it.'),
      capability('support', 'operations', 'Support', '160,60', 2,
        'Putting things right when they go wrong.'),
    ],
    connectors: [
      {
        from: 'customer-profile',
        to: 'support',
        description: 'Support reads the profile to answer for the account in front of them.',
        fromPoint: 6,
        toPoint: 18,
        lineStyle: 'straight',
        anchored: false,
      },
    ],
  };
}

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
console.log('  npm run start:dev\n');
console.log(`Then edit brand/css/brand.css and seed/data/settings.json to make it yours.`);
