-- Who may do what. A person is one row whatever they sign in with: the logins
-- table maps each provider's own id for them -- Entra's object id, the name
-- typed into the development bypass -- to the person, so swapping one provider
-- for another later keeps everyone's role, and someone who arrives by two doors
-- is still one person.
--
-- A person can be here before they have ever signed in: an administrator adds
-- them by email, and the first sign-in that carries that address attaches the
-- login. The address is kept as typed and matched case-folded, since nobody
-- types one the same way twice.
create table people (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  email          text,
  role           text not null check (role in ('viewer', 'contributor', 'publisher', 'administrator')),
  created_at     timestamptz(3) not null default now(),
  last_signed_in timestamptz(3)
);

create unique index people_email on people (lower(email)) where email is not null;

-- One administrator, always. A partial unique index over an expression that is
-- the same for every administrator admits one row, so the database itself
-- refuses a second; handing over is one transaction that demotes before it
-- promotes.
create unique index people_one_administrator on people ((role = 'administrator')) where role = 'administrator';

create table logins (
  source     text not null,
  subject    text not null,
  person_id  uuid not null references people (id) on delete cascade,
  first_seen timestamptz(3) not null default now(),
  last_seen  timestamptz(3) not null default now(),
  primary key (source, subject)
);

create index logins_person on logins (person_id);
