-- Versions of the map. A version is still one whole document: it is kept as the
-- text a save wrote, not as jsonb and not split into tables, so what comes back
-- out is byte for byte what went in and Export hands over the same file.
--
-- Times are kept to the millisecond, the precision JavaScript has, so the
-- `updated_at` a client was given can be compared exactly when it saves back.
create table versions (
  id               bigint generated always as identity primary key,
  name             text not null unique,
  document         text not null,
  created_at       timestamptz(3) not null default now(),
  created_by_name  text,
  created_by_email text,
  updated_at       timestamptz(3) not null default now(),
  updated_by_name  text,
  updated_by_email text
);

-- One row, always: what the whole site shares. Restrict rather than cascade or
-- set null, so the database itself refuses to delete the published version.
create table site (
  id                   boolean primary key default true check (id),
  published_version_id bigint references versions (id) on delete restrict
);

insert into site default values;
