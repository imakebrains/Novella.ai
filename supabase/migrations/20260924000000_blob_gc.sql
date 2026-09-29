-- ============================================================
-- Reclaiming storage: which blobs nothing points at any more
--
-- Blobs are content-addressed and never overwritten, so a replaced
-- cover, a deleted book or a push that never landed each leave an
-- object behind for good. The gc-blobs function (service_role, on a
-- schedule — docs/CLOUD.md, "Reclaiming storage") asks this for the
-- keys and removes them through the Storage API, the way
-- delete-account does: deleting storage.objects rows in SQL would
-- orphan the bytes underneath.
--
-- "Nothing points at it" means no live project_files row carries the
-- key. A tombstone's blob is collectable — the row keeps the fact of
-- the deletion and never a body (the CHECKs on project_files).
--
-- The hour is the race guard. A client uploads first and calls
-- push_file second, and between the two the object is unreferenced by
-- definition. Nothing younger than an hour is listed. The engine
-- uploads and pushes in the same pass, seconds apart, and a sync that
-- died between the two uploads again before it pushes
-- (supabaseRemote.putBlob), so an hour-old orphan is exactly that.
--
-- One gap the hour cannot close: putBlob treats "already exists" as
-- success without refreshing created_at, so re-pushing bytes identical
-- to an hour-old orphan (a cover put back the way it was) during the
-- seconds between gc-blobs listing a key and removing it would leave
-- a live row pointing at nothing. Narrow, and the writing device
-- still holds the bytes, but it is why the engine must never cache
-- "already uploaded" and skip putBlob: that would widen the gap to hours.
--
-- service_role only, like account_blob_keys: any client-callable
-- version would say which of another writer's files are unreferenced.
-- ============================================================

-- The NOT EXISTS below probes by key; without this it is a scan of
-- every file the writer has, once per object.
create index project_files_blob_key_idx on public.project_files (blob_key)
  where blob_key is not null;

create function public.unreferenced_blob_keys(p_user uuid)
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
    and o.created_at < now() - interval '1 hour'
    and not exists (
      select 1
      from public.project_files f
      where f.blob_key = o.name
        and not f.deleted
    )
  order by o.name;
$$;

revoke execute on function public.unreferenced_blob_keys(uuid) from public, anon, authenticated;
