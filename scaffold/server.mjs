// The whole integration. Everything else in this repo is content: what the map
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
server.listen(port, () => console.log(`{{title}} on http://localhost:${port}`));
