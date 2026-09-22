-- A version is in somebody's sandbox, or shared. A sandbox is one person's:
-- what they save is theirs until they share it, and nobody else -- not a
-- publisher, not the administrator -- is shown what is in it. Shared is what
-- every contributor sees: fixed copies put in the open, never edited in place.
-- Everything from before sandboxes was site-wide, and stays so: shared, with
-- nobody as its sharer.
alter table versions
  add column sandbox_of uuid references people (id) on delete cascade,
  add column shared_by  uuid references people (id) on delete set null;

-- A name is unique within a sandbox, and once among the shared versions. The
-- same name may sit in two sandboxes, or in a sandbox and in the open: a copy
-- taken to work on keeps the name it was shared under.
alter table versions drop constraint versions_name_key;
create unique index versions_name_per_scope
  on versions (coalesce(sandbox_of, '00000000-0000-0000-0000-000000000000'), name);

create index versions_sandbox on versions (sandbox_of);
