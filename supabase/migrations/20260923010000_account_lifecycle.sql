-- ============================================================
-- Leaving: what the delete-account function needs from the database
--
-- Deleting the auth.users row cascades to everything the first
-- migration created (projects → files, settings, entitlements, AI
-- usage), so rows need no help. Storage objects do: they are not
-- foreign-keyed to anything, and deleting storage.objects rows in SQL
-- would orphan the bytes in the underlying bucket. The function must
-- remove them through the Storage API, so it needs the full list —
-- which this provides without exposing the storage schema over the
-- REST API.
--
-- service_role only. A writer asking for another writer's key list is
-- exactly the leak the rest of the schema exists to prevent.
-- ============================================================

create function public.account_blob_keys(p_user uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'vault'
    and (storage.foldername(o.name))[1] = p_user::text
  order by o.name;
$$;

revoke execute on function public.account_blob_keys(uuid) from public, anon, authenticated;
