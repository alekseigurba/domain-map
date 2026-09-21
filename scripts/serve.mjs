#!/usr/bin/env node
// The CLI over scripts/server.mjs: run the stock app from a checkout of this
// repo. Another repo installing this as a package does not use this file — it
// imports `createDomainMapServer` and passes its own brand and seed. See
// BRANDING.md.
//
//   node scripts/serve.mjs [app-dir] [port]
import { createDomainMapServer } from './server.mjs';

const server = createDomainMapServer({
  root: process.argv[2],
  storageDir: process.env.STORAGE_DIR,
});

const port = Number(process.env.PORT ?? process.argv[3] ?? 8000);

server.listen(port, () => {
  const { root, brandDir, storageDir, database } = server.config;
  console.log(`Serving ${root} at http://localhost:${port}`);
  if (brandDir) console.log(`Branding from ${brandDir}`);
  console.log(`Storing files in ${storageDir}, and versions in Postgres at ${database}`);
  const { assistant } = server.config;
  console.log(assistant
    ? `The Assistant is connected to ${assistant.host}${assistant.model ? `, model ${assistant.model}` : ''}`
    : 'The Assistant has no model: set ASSISTANT_API_URL and ASSISTANT_API_KEY to connect one');
});
