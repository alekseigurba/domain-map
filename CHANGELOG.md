# Changelog

What changed in each release, newest first. A release is a version in
`package.json` and a git tag of the same name — see "Publish a version of this
package" in the [README](README.md). A release with more to say than fits here
has a page of its own under [docs/releases/](docs/releases/).

## 1.0.0 — 2026-09-16

Version 1.

## 2.0.0-pre.1 — 2026-09-18

The versions of the map move into Postgres, and who may change them is now a
role. **Breaking**: the server does not start without `DATABASE_URL`, and the
API for versions has moved. Upgrading a 1.x repo:
[docs/upgrade-v1-to-v2.md](docs/upgrade-v1-to-v2.md). Full notes:
[docs/releases/2.0.0.md](docs/releases/2.0.0.md).

### Added

- **Roles.** `OWNER_EMAILS` lists who may open any version, edit, save, delete
  and publish. Everyone else who signs in sees the published version only. With
  sign-in off, everyone is an owner.
- **A published version**, which is what the plain URL opens for everyone.
  `?version=<name>` opens another one, for an owner.
- **A Versions dialog** for owners: open, save as new, publish and delete, with
  who last saved each one and when.
- **A profile popup** under an initials avatar, holding the name, email, role
  and Sign out.
- **Postgres**, holding the versions and the published pointer. Schema is
  numbered `.sql` files applied at startup. `pg` is the first runtime dependency.
- `DEPLOY.md` in a scaffolded repo: Azure Container Apps, with Postgres beside
  the app on a mounted volume.

### Changed

- A new version is named `v1`, `v2`, `v3` by the server; there is no name field.
- Saving over a version somebody else saved in the meantime is refused, and the
  map can be saved as a new version instead.
- The published version cannot be deleted until another one is published.
- Writes to `/api/files` are an owner's, and the seed map is `seed/data/versions/v1.json`.

### Removed

- Renaming a version, and saving over some other version than the one open.
- The browser's memory of the last version it had open: a fresh visit opens the
  published one.

## Earlier releases

1.0.0 to 1.0.2 predate this file. Their history is in the git log.
