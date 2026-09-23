-- ============================================================
-- Novella cloud: accounts, projects, synced files, plans
--
-- The contract this schema exists to keep: a writer's work is
-- theirs alone. Every table a signed-in client can reach has row
-- level security, and every policy reduces to one comparison —
-- owner_id = auth.uid(). There is no sharing column, no team
-- table and no admin read path in here, on purpose. Collaboration,
-- when it comes, gets its own tables and its own review.
--
-- Supabase grants anon and authenticated full privileges on every
-- new table in public by default, so the grants below are REVOKES
-- first. The tests in supabase/tests run against a stub that
-- reproduces those defaults, which is the only honest way to prove
-- a policy and not a lucky permission.
--
-- Writes to synced files never go straight at the table. They go
-- through push_file(), which is the one place that knows about
-- versions, the per-project change counter and plan limits. A
-- client that could UPDATE project_files directly could skip all
-- three, so it can't.
-- ============================================================

-- ------------------------------------------------------------
-- Plans
--
-- The server's copy of the tier table. src/cloud/plans.ts carries
-- the same numbers for the UI, and test-cloud.ts parses this file
-- to prove the two agree — a limit the app advertises and the
-- server doesn't enforce (or the reverse) is a support ticket.
-- ------------------------------------------------------------

create table public.plan_limits (
  tier text primary key check (tier in ('free', 'plus', 'pro')),
  -- null means unlimited
  max_projects integer check (max_projects is null or max_projects > 0),
  max_bytes bigint not null check (max_bytes > 0),
  -- Hosted AI allowance per calendar month, in millionths of a dollar
  -- of model cost. Zero means bring-your-own only.
  ai_monthly_microusd bigint not null default 0 check (ai_monthly_microusd >= 0)
);

insert into public.plan_limits (tier, max_projects, max_bytes, ai_monthly_microusd) values
  ('free', 1,    104857600,   0),        -- 1 synced book, 100 MB
  ('plus', null, 10737418240, 0),        -- unlimited books, 10 GB
  ('pro',  null, 21474836480, 6000000);  -- unlimited, 20 GB, $6.00 of model cost

alter table public.plan_limits enable row level security;
revoke all on public.plan_limits from anon, authenticated;
grant select on public.plan_limits to anon, authenticated;
create policy plan_limits_public_read on public.plan_limits
  for select to anon, authenticated using (true);

-- ------------------------------------------------------------
-- Entitlements
--
-- Written only by the billing webhook, which runs as service_role
-- and bypasses RLS. A writer can read their own row and nothing
-- else; there is no insert or update grant, so no client can
-- promote itself to Pro.
-- ------------------------------------------------------------

create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free' references public.plan_limits (tier),
  status text not null default 'active'
    check (status in ('active', 'trialing', 'past_due', 'paused', 'canceled')),
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text unique,
  updated_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;
revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;
create policy entitlements_own_read on public.entitlements
  for select to authenticated using (user_id = (select auth.uid()));

-- The tier that actually applies right now. A lapsed card keeps
-- paid features for a week of grace (past_due), because a writer
-- mid-draft losing sync over a bank's fraud check is the wrong
-- first consequence. Canceled means free — the provider keeps the
-- status 'active' until the paid period really ends.
create function public.effective_tier_for(uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select e.tier
    from public.entitlements e
    where e.user_id = uid
      and (
        e.status in ('active', 'trialing')
        or (e.status = 'past_due'
            and (e.current_period_end is null or e.current_period_end > now() - interval '7 days'))
      )
  ), 'free');
$$;

-- Not callable by clients: with an arbitrary uid it would tell
-- anyone whether any other account pays. my_account() is the
-- client-facing door and only ever answers about the caller.
revoke execute on function public.effective_tier_for(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Projects
--
-- One row per synced book. `seq` is the project's change counter:
-- every accepted file write bumps it while holding this row's lock,
-- so seq values commit in order with no gaps a reader could skip.
-- That is what lets a device ask "everything since 41" and trust
-- the answer.
-- ------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- lets project_files carry owner_id and prove it matches
  unique (id, owner_id)
);

create index projects_owner_idx on public.projects (owner_id, created_at);

alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;
-- Column grants: a client names a project and renames it. It never
-- sets owner_id (the trigger does) or seq (push_file does).
grant select, delete on public.projects to authenticated;
grant insert (id, name) on public.projects to authenticated;
grant update (name) on public.projects to authenticated;

create policy projects_own_select on public.projects
  for select to authenticated using (owner_id = (select auth.uid()));
create policy projects_own_insert on public.projects
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy projects_own_update on public.projects
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy projects_own_delete on public.projects
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Stamps the owner and enforces the project count. The count is
-- checked here rather than trusted to the app so that a plain
-- PostgREST insert gets the same answer as the UI.
create function public.projects_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cap integer;
  have integer;
begin
  if uid is not null then
    new.owner_id := uid;
  end if;
  if new.owner_id is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  -- A retried create (the first response was lost) must fail as the
  -- duplicate it is, not as "upgrade your plan" — so an id that
  -- already exists skips the count and meets the primary key instead.
  if exists (select 1 from public.projects p where p.id = new.id) then
    return new;
  end if;

  select l.max_projects into cap
  from public.plan_limits l
  where l.tier = public.effective_tier_for(new.owner_id);

  if cap is not null then
    select count(*) into have from public.projects p where p.owner_id = new.owner_id;
    if have >= cap then
      raise exception 'plan_limit:projects' using errcode = 'P0001',
        hint = 'This plan syncs ' || cap || ' book(s). Upgrade, or delete a synced book first.';
    end if;
  end if;

  new.seq := 0;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.projects_before_insert() from public, anon, authenticated;

create trigger projects_before_insert
  before insert on public.projects
  for each row execute function public.projects_before_insert();

-- ------------------------------------------------------------
-- Synced files
--
-- One row per path per project: the CURRENT state of that file.
-- A deletion is a tombstone (deleted = true) rather than a missing
-- row, because a device that was offline for a month needs to
-- learn that Chapter 3 went away, and a missing row says nothing.
--
-- Text lives inline in `content`; bytes (cover art, card images)
-- live in the vault storage bucket under
-- <owner>/<project>/<sha256> and the row points at them.
-- ------------------------------------------------------------

create table public.project_files (
  project_id uuid not null,
  owner_id uuid not null,
  path text not null
    check (char_length(path) between 1 and 1024)
    check (left(path, 1) <> '/')
    check (path !~ '(^|/)\.\.(/|$)')
    check (position(chr(92) in path) = 0),
  version bigint not null check (version > 0),
  seq bigint not null,
  sha256 text not null,
  size bigint not null check (size >= 0),
  deleted boolean not null default false,
  content text,
  blob_key text,
  device text check (device is null or char_length(device) <= 80),
  updated_at timestamptz not null default now(),
  primary key (project_id, path),
  foreign key (project_id, owner_id) references public.projects (id, owner_id) on delete cascade,
  check (content is null or blob_key is null),
  check (deleted or content is not null or blob_key is not null),
  check (not deleted or (content is null and blob_key is null))
);

create index project_files_changes_idx on public.project_files (project_id, seq);
create index project_files_owner_idx on public.project_files (owner_id) where not deleted;

alter table public.project_files enable row level security;
revoke all on public.project_files from anon, authenticated;
grant select on public.project_files to authenticated;
create policy project_files_own_select on public.project_files
  for select to authenticated using (owner_id = (select auth.uid()));

-- Largest file kept inline. Bigger text goes to storage like any
-- other bytes; a 2 MB chapter is already a strange chapter.
create function public.max_inline_bytes() returns integer
language sql immutable set search_path = '' as $$ select 2097152 $$;

-- ------------------------------------------------------------
-- push_file — the only write path for synced files
--
-- Compare-and-swap on the file's version: the client says which
-- version its edit was based on, and the write lands only if that
-- is still current. Otherwise the answer is a conflict carrying the
-- current row, and the client decides what to keep. Nothing here
-- ever merges or picks a winner — losing words silently is the one
-- failure this whole feature is not allowed to have.
--
-- SECURITY DEFINER because clients hold no write grant on the
-- table. Ownership is therefore checked by hand, first, against
-- auth.uid() — the lock on the project row doubles as that check.
-- ------------------------------------------------------------

create function public.push_file(
  p_project uuid,
  p_path text,
  p_base_version bigint,
  p_sha256 text,
  p_deleted boolean,
  p_content text default null,
  p_blob_key text default null,
  p_device text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  proj public.projects%rowtype;
  cur public.project_files%rowtype;
  lim public.plan_limits%rowtype;
  real_size bigint;
  prior_size bigint;
  used bigint;
  rank integer;
  next_seq bigint;
  next_version bigint;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  select * into proj from public.projects where id = p_project and owner_id = uid for update;
  if not found then
    -- Same answer for "doesn't exist" and "isn't yours", deliberately.
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into cur from public.project_files where project_id = p_project and path = p_path for update;

  if coalesce(cur.version, 0) <> p_base_version then
    return jsonb_build_object(
      'ok', false,
      'reason', 'conflict',
      'current', case when cur.path is null then null else to_jsonb(cur) - 'owner_id' end
    );
  end if;

  -- Shape of the write. Every rule the table's CHECKs would also
  -- catch is repeated here only where the error needs to be legible.
  if p_deleted then
    if p_content is not null or p_blob_key is not null then
      raise exception 'bad_request:deleted_with_body' using errcode = '22023';
    end if;
    real_size := 0;
    p_sha256 := '';
  elsif p_content is not null then
    if p_blob_key is not null then
      raise exception 'bad_request:two_bodies' using errcode = '22023';
    end if;
    real_size := octet_length(p_content);
    if real_size > public.max_inline_bytes() then
      raise exception 'bad_request:inline_too_large' using errcode = '22023';
    end if;
    -- The hash is the client's claim about what it sent. Checking it
    -- here means a truncated request can never become the stored copy.
    if p_sha256 is distinct from encode(sha256(convert_to(p_content, 'UTF8')), 'hex') then
      raise exception 'bad_request:sha_mismatch' using errcode = '22023';
    end if;
  elsif p_blob_key is not null then
    -- Blobs are content-addressed inside the caller's own folder.
    if p_blob_key <> uid::text || '/' || p_project::text || '/' || p_sha256 then
      raise exception 'bad_request:blob_key' using errcode = '22023';
    end if;
    -- The size comes from storage, not from the client, so quota
    -- can't be dodged by under-reporting it.
    select (o.metadata ->> 'size')::bigint into real_size
    from storage.objects o
    where o.bucket_id = 'vault' and o.name = p_blob_key;
    if real_size is null then
      raise exception 'bad_request:blob_missing' using errcode = '22023';
    end if;
  else
    raise exception 'bad_request:no_body' using errcode = '22023';
  end if;

  select * into lim from public.plan_limits where tier = public.effective_tier_for(uid);

  -- Project cap after a downgrade: books beyond the plan's count keep
  -- everything already in the cloud and stay readable; they just stop
  -- accepting new changes until the writer upgrades or deletes one.
  -- Oldest books keep syncing, so a downgrade never silently moves
  -- the one being written to the paused pile.
  if lim.max_projects is not null then
    select count(*) + 1 into rank
    from public.projects p
    where p.owner_id = uid
      and (p.created_at, p.id) < (proj.created_at, proj.id);
    if rank > lim.max_projects then
      return jsonb_build_object('ok', false, 'reason', 'limit', 'limit', 'projects');
    end if;
  end if;

  -- Storage cap. A write that doesn't grow usage always lands, so a
  -- writer over quota can still edit, shrink and delete their way
  -- back under it rather than being frozen out of their own book.
  prior_size := case when cur.path is null or cur.deleted then 0 else cur.size end;
  if real_size > prior_size then
    select coalesce(sum(f.size), 0) into used
    from public.project_files f
    where f.owner_id = uid and not f.deleted;
    if used - prior_size + real_size > lim.max_bytes then
      return jsonb_build_object('ok', false, 'reason', 'limit', 'limit', 'bytes');
    end if;
  end if;

  update public.projects set seq = seq + 1, updated_at = now()
  where id = p_project
  returning seq into next_seq;

  next_version := coalesce(cur.version, 0) + 1;

  insert into public.project_files as f
    (project_id, owner_id, path, version, seq, sha256, size, deleted, content, blob_key, device, updated_at)
  values
    (p_project, uid, p_path, next_version, next_seq, p_sha256, real_size, p_deleted,
     case when p_deleted then null else p_content end,
     case when p_deleted then null else p_blob_key end,
     left(p_device, 80), now())
  on conflict (project_id, path) do update set
    version = excluded.version,
    seq = excluded.seq,
    sha256 = excluded.sha256,
    size = excluded.size,
    deleted = excluded.deleted,
    content = excluded.content,
    blob_key = excluded.blob_key,
    device = excluded.device,
    updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true, 'version', next_version, 'seq', next_seq);
end;
$$;

revoke execute on function public.push_file(uuid, text, bigint, text, boolean, text, text, text) from public, anon;
grant execute on function public.push_file(uuid, text, bigint, text, boolean, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- Settings that follow the writer, not the book
--
-- One JSON document per account: theme, accent, prose font, tool
-- layout choices — whatever src/cloud/prefs.ts classifies as
-- "account". Versioned the same way files are, so two machines
-- changing the theme at once is a visible conflict rather than a
-- coin toss. API keys are never in here; see docs/CLOUD.md.
-- ------------------------------------------------------------

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  doc jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;
revoke all on public.user_settings from anon, authenticated;
grant select on public.user_settings to authenticated;
create policy user_settings_own_select on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));

create function public.put_settings(p_base_version bigint, p_doc jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cur public.user_settings%rowtype;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if jsonb_typeof(p_doc) <> 'object' then
    raise exception 'bad_request:not_an_object' using errcode = '22023';
  end if;
  if octet_length(p_doc::text) > 262144 then
    raise exception 'bad_request:settings_too_large' using errcode = '22023';
  end if;

  select * into cur from public.user_settings where user_id = uid for update;
  if coalesce(cur.version, 0) <> p_base_version then
    return jsonb_build_object('ok', false, 'reason', 'conflict',
      'current', case when cur.user_id is null then null
                      else jsonb_build_object('doc', cur.doc, 'version', cur.version) end);
  end if;

  insert into public.user_settings as s (user_id, doc, version, updated_at)
  values (uid, p_doc, p_base_version + 1, now())
  on conflict (user_id) do update set doc = excluded.doc, version = excluded.version, updated_at = now();

  return jsonb_build_object('ok', true, 'version', p_base_version + 1);
end;
$$;

revoke execute on function public.put_settings(bigint, jsonb) from public, anon;
grant execute on function public.put_settings(bigint, jsonb) to authenticated;

-- ------------------------------------------------------------
-- Hosted AI metering
--
-- Calendar months in UTC: "resets on the 1st" is a sentence a
-- writer can hold in their head, which a rolling billing-period
-- window is not. Only the ai-proxy function (service_role) writes.
-- ------------------------------------------------------------

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  period date not null,
  microusd bigint not null default 0 check (microusd >= 0),
  requests integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (user_id, period)
);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
create policy ai_usage_own_select on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

create function public.record_ai_usage(
  p_user uuid, p_microusd bigint, p_input_tokens bigint, p_output_tokens bigint
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_usage as u (user_id, period, microusd, requests, input_tokens, output_tokens)
  values (p_user, date_trunc('month', now() at time zone 'utc')::date,
          greatest(p_microusd, 0), 1, greatest(p_input_tokens, 0), greatest(p_output_tokens, 0))
  on conflict (user_id, period) do update set
    microusd = u.microusd + excluded.microusd,
    requests = u.requests + 1,
    input_tokens = u.input_tokens + excluded.input_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens
  returning u.microusd;
$$;

revoke execute on function public.record_ai_usage(uuid, bigint, bigint, bigint) from public, anon, authenticated;

-- ------------------------------------------------------------
-- my_account — everything the Account screen shows, in one call,
-- and only ever about the caller.
-- ------------------------------------------------------------

create function public.my_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t text;
  lim public.plan_limits%rowtype;
  ent public.entitlements%rowtype;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  t := public.effective_tier_for(uid);
  select * into lim from public.plan_limits where tier = t;
  select * into ent from public.entitlements where user_id = uid;
  return jsonb_build_object(
    'tier', t,
    'status', coalesce(ent.status, 'active'),
    'current_period_end', ent.current_period_end,
    'max_projects', lim.max_projects,
    'max_bytes', lim.max_bytes,
    'ai_monthly_microusd', lim.ai_monthly_microusd,
    'projects', (select count(*) from public.projects p where p.owner_id = uid),
    'bytes_used', (select coalesce(sum(f.size), 0) from public.project_files f
                   where f.owner_id = uid and not f.deleted),
    'ai_used_microusd', coalesce((select a.microusd from public.ai_usage a
                   where a.user_id = uid
                     and a.period = date_trunc('month', now() at time zone 'utc')::date), 0)
  );
end;
$$;

revoke execute on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;

-- ------------------------------------------------------------
-- Storage: the vault bucket
--
-- Private. Every object lives under the owner's user id as its
-- first folder, and every policy checks that folder against
-- auth.uid(). No update policy: objects are content-addressed, so
-- a changed file is a new object, never an overwrite.
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('vault', 'vault', false, 52428800)
on conflict (id) do nothing;

create policy vault_own_read on storage.objects
  for select to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy vault_own_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy vault_own_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);
