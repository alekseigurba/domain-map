FROM node:22-alpine

WORKDIR /srv

# The package installs from a git tag, so git has to be here for npm.
RUN apk add --no-cache git openssh-client

# A repo that has run `npm install` once has a lockfile, and then the build is
# reproducible. A freshly scaffolded one has none yet, and still builds. Commit
# the lockfile when you have it.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# If the package repo is private, the build needs a key instead. Swap the line
# above for these two and build with `docker build --ssh default .`:
#
#   RUN mkdir -p -m 0700 ~/.ssh && ssh-keyscan github.com >> ~/.ssh/known_hosts
#   RUN --mount=type=ssh sh -c 'if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi'

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
