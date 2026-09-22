-- More than one administrator. 2.5.0 admitted one, so the map depended on one
-- person being there to change a role; a second is the cover for a holiday or
-- a departure, and handing over becomes making someone an administrator and
-- letting them take the old one down. That there is always at least one is
-- the people store's to keep now: nobody changes or removes their own row, and
-- a change that would leave no administrator is refused.
drop index people_one_administrator;
