-- Realtime is a nudge, not the transport: a device subscribed to its
-- project's row learns "something changed" the moment push_file bumps
-- seq, and pulls. Polling stays, so a dropped socket costs a minute.
--
-- Realtime filters rows through the existing projects_own_select
-- policy, so a writer only ever hears about their own books.
--
-- Guarded twice: the plain-Postgres test database (supabase/tests) has
-- no supabase_realtime publication, and adding a table that is already
-- a member raises an error.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projects'
     ) then
    alter publication supabase_realtime add table public.projects;
  end if;
end $$;
