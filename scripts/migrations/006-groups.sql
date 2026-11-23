-- Groups, and who a shared version is shared with.
--
-- A group is a name and its members: people from the list, put together by an
-- administrator in Users & access. It is the app's own — nothing to do with
-- the groups of whoever signs people in — so it needs no directory behind it
-- and no consent from anyone's tenant. Everyone a group can name is a row in
-- `people` already: whoever has signed in, or was added by email ahead of it.
create table groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz(3) not null default now()
);

-- One group to a name, whatever its case: two called "Design" and "design"
-- would be told apart by nobody choosing between them.
create unique index groups_name on groups (lower(name));

create table group_members (
  group_id  uuid not null references groups (id) on delete cascade,
  person_id uuid not null references people (id) on delete cascade,
  primary key (group_id, person_id)
);

create index group_members_person on group_members (person_id);

-- A shared version is shared with everyone who works on the map, as every
-- shared version was, or with the people and groups named for it. Which of the
-- two is said outright, in `restricted`, and not read off whether anyone is
-- named: a version shared with one group must not fall open to everyone on the
-- day that group is deleted. Restricted and naming nobody is a version only
-- its sharer and the administrators can see.
--
-- Only a shared version has an audience. One in a sandbox is its owner's
-- alone, which no column needs to say.
alter table versions
  add column restricted boolean not null default false,
  add constraint versions_restricted_is_shared check (not restricted or sandbox_of is null);

create table version_people (
  version_id bigint not null references versions (id) on delete cascade,
  person_id  uuid   not null references people (id) on delete cascade,
  primary key (version_id, person_id)
);

create table version_groups (
  version_id bigint not null references versions (id) on delete cascade,
  group_id   uuid   not null references groups (id) on delete cascade,
  primary key (version_id, group_id)
);

create index version_people_person on version_people (person_id);
create index version_groups_group on version_groups (group_id);
