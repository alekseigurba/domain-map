FROM node:22-alpine

WORKDIR /srv

# One dependency, the Postgres driver, and no build step: the app is ES modules
# the browser reads, and the server is Node's own http module.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app ./app
COPY scripts ./scripts
COPY seed ./seed

# Production refuses the sign-in bypass whatever else is set. The rest is
# configured at run time: DATABASE_URL, OWNER_EMAILS, and for sign-in
# AUTH_TENANT_ID, AUTH_CLIENT_ID, AUTH_CLIENT_SECRET and AUTH_SESSION_SECRET.
ENV NODE_ENV=production
ENV STORAGE_DIR=/store
ENV PORT=8000

EXPOSE 8000
VOLUME ["/store/data"]

CMD ["node", "scripts/serve.mjs", "app"]
