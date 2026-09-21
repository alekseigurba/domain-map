# Deploying {{title}} to Azure Container Apps

One container app with two containers: the map, and a Postgres beside it. They
share a network, so the map reaches the database at `localhost:5432` and no
database is exposed to anyone. Two Azure Files shares keep the state: one for
the icons, the logo and the settings, one for Postgres.

**Pin it to a single replica.** Two replicas would mean two Postgres processes
writing the same files. The YAML below does that, and it is the one setting
here that must not change.

## 1. Build and push the image

```bash
az acr build --registry $ACR --image {{slug}}:$(git rev-parse --short HEAD) .
```

## 2. Two file shares

```bash
az storage share-rm create --storage-account $STORAGE --name {{slug}}-data --quota 16
az storage share-rm create --storage-account $STORAGE --name {{slug}}-db   --quota 64
KEY=$(az storage account keys list -n $STORAGE --query "[0].value" -o tsv)

for SHARE in data db; do
  az containerapp env storage set \
    --name $ENVIRONMENT --resource-group $GROUP \
    --storage-name {{slug}}-$SHARE --access-mode ReadWrite \
    --azure-file-account-name $STORAGE --azure-file-account-key $KEY \
    --azure-file-share-name {{slug}}-$SHARE
done
```

## 3. The app

Postgres will not start on a share it cannot take ownership of, so its volume
carries mount options, and `PGDATA` points at a subfolder of the mount rather
than the mount itself. `postgres:17` runs as uid 999; on `postgres:17-alpine` it
is 70.

Save this as `app.yaml`, filling in the image, and keeping the password and the
sign-in secrets as secrets:

```yaml
properties:
  configuration:
    activeRevisionsMode: Single
    ingress: { external: true, targetPort: 8000, transport: auto }
    secrets:
      - { name: db-password, value: "<a long random string>" }
      - { name: auth-client-secret, value: "<from the Entra app registration>" }
      - { name: auth-session-secret, value: "<a long random string>" }
  template:
    scale: { minReplicas: 1, maxReplicas: 1 }   # never more than one
    containers:
      - name: map
        image: <registry>.azurecr.io/{{slug}}:<tag>
        env:
          - { name: DATABASE_URL, value: "postgres://{{slug}}:$(DB_PASSWORD)@localhost:5432/{{slug}}" }
          - { name: DB_PASSWORD, secretRef: db-password }
          - { name: STORAGE_DIR, value: /store }
          - { name: OWNER_EMAILS, value: "you@example.com" }
          - { name: AUTH_TENANT_ID, value: "<tenant>" }
          - { name: AUTH_CLIENT_ID, value: "<app registration>" }
          - { name: AUTH_CLIENT_SECRET, secretRef: auth-client-secret }
          - { name: AUTH_SESSION_SECRET, secretRef: auth-session-secret }
        volumeMounts:
          - { volumeName: data, mountPath: /store/data }
      - name: postgres
        image: postgres:17
        env:
          - { name: POSTGRES_USER, value: "{{slug}}" }
          - { name: POSTGRES_PASSWORD, secretRef: db-password }
          - { name: POSTGRES_DB, value: "{{slug}}" }
          - { name: PGDATA, value: /var/lib/postgresql/data/pgdata }
        volumeMounts:
          - { volumeName: db, mountPath: /var/lib/postgresql/data }
    volumes:
      - { name: data, storageName: {{slug}}-data, storageType: AzureFile }
      - name: db
        storageName: {{slug}}-db
        storageType: AzureFile
        mountOptions: uid=999,gid=999,dir_mode=0750,file_mode=0750,mfsymlinks,nobrl,cache=none
```

`$(DB_PASSWORD)` is resolved by Container Apps from the variable above it, so
the password is written once.

```bash
az containerapp create --name {{slug}} --resource-group $GROUP \
  --environment $ENVIRONMENT --yaml app.yaml
```

Then set the app's URL as a redirect URI on the Entra app registration:
`https://<fqdn>/signin-oidc`.

## 4. The Assistant's model

The map's **Assistant** asks an AI about the map. With nothing set it writes a
prompt to copy into a chat of your own; with a model connected, an owner talks
to it in the page. Two variables connect one, and two more are optional:

| Variable | What it holds |
| --- | --- |
| `ASSISTANT_API_URL` | Where a message is posted, as it stands: a chat-completions URL (OpenAI, Azure OpenAI, Azure AI Foundry, a gateway, Ollama) or Anthropic's `/v1/messages`. |
| `ASSISTANT_API_KEY` | The key. It is sent as `Authorization: Bearer` and as `api-key`, or as `x-api-key` for Anthropic, and never reaches the browser. |
| `ASSISTANT_MODEL` | The model to ask for, by the API's own id for it: `claude-haiku-4-5`, not `haiku`. Leave it out where the URL already names a deployment; for Anthropic it defaults to `claude-opus-5`. |
| `ASSISTANT_API_STYLE` | `openai` or `anthropic`, for a gateway whose URL does not say which. |

Keep the key as a secret, beside the sign-in ones, and point the variable at it:

```yaml
    secrets:
      - { name: assistant-api-key, value: "<from whoever runs the model>" }
...
        env:
          - { name: ASSISTANT_API_URL, value: "https://<resource>.openai.azure.com/openai/v1/chat/completions" }
          - { name: ASSISTANT_API_KEY, secretRef: assistant-api-key }
          - { name: ASSISTANT_MODEL, value: "<deployment or model>" }
```

Every message an owner sends carries the whole map, drafts included, to whatever
the URL points at, on that key — so who is an owner, `OWNER_EMAILS`, is also who
may spend it. With Postgres in the app, change these the way the image is
changed, with the old revision stopped first: two revisions are two Postgres on
one data directory.

## Afterwards

- **Upgrades** are `az acr build` again, then `az containerapp update --image`.
  The app brings the database's schema up to date as it starts.
- **Backups**: `az containerapp exec -n {{slug}} --container postgres --command
  "pg_dump -U {{slug}} {{slug}}"`, kept somewhere outside this resource group.
  The file share is not a backup.
- **Anything you cannot lose** belongs on a managed database rather than a file
  share: `az postgres flexible-server create`, then point `DATABASE_URL` at it
  and drop the Postgres container and its volume. Nothing else changes.
