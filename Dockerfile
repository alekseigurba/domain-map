FROM node:22-alpine

WORKDIR /srv

# Nothing to install: the app is ES modules the browser reads, and the server is
# Node's own http module. There is no package to fetch and no build to run.
COPY package.json ./
COPY app ./app
COPY scripts ./scripts
COPY seed ./seed

# Production refuses the sign-in bypass whatever else is set. Sign-in itself is
# configured at run time: AUTH_TENANT_ID, AUTH_CLIENT_ID, AUTH_CLIENT_SECRET and
# AUTH_SESSION_SECRET, as in docs/EntraID-Authentication.MD.
ENV NODE_ENV=production
ENV STORAGE_DIR=/store
ENV PORT=8000

EXPOSE 8000
VOLUME ["/store/data"]

CMD ["node", "scripts/serve.mjs", "app"]
