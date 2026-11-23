-- What an administrator has said about the Assistant's model, from inside the
-- app. One row, always, as `site` is: whether the model is switched on, and a
-- key of the app's own for it.
--
-- The key is the one thing here that is a secret. It is kept sealed — encrypted
-- by the server with a key it derives from its own secret, which is not in this
-- database — so a copy of the table is no use to whoever reads it. Nothing
-- reads it back out to a person: the app says whether a key is kept, when it
-- was set and by whom, and never what it is.
--
-- No key here is the ordinary case: the model then runs on the key the
-- deployment was given, ASSISTANT_API_KEY, as it did before there was a row.
create table assistant_settings (
  id         boolean primary key default true check (id),
  enabled    boolean not null default true,
  api_key    text,
  key_set_at timestamptz(3),
  key_set_by uuid references people (id) on delete set null
);

insert into assistant_settings default values;
