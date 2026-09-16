FROM node:22-alpine

WORKDIR /srv

# The package installs from a git tag, so git has to be here for `npm ci`.
RUN apk add --no-cache git openssh-client

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# If the package repo is private, the build needs a key instead. Swap the line
# above for these two and build with `docker build --ssh default .`:
#
#   RUN mkdir -p -m 0700 ~/.ssh && ssh-keyscan github.com >> ~/.ssh/known_hosts
#   RUN --mount=type=ssh npm ci --omit=dev

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
