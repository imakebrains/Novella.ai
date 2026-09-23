-- ============================================================
-- Proving the privacy promise: nobody reaches anybody else's book.
--
-- Run by supabase/tests/run.sh against a throwaway database that has
-- the stub and the migration loaded. Every assertion raises on
-- failure, and psql runs with ON_ERROR_STOP, so the first broken
-- promise stops the run with a non-zero exit.
--
-- Two writers, A and B, and every way B could plausibly reach A's
-- work: read it, overwrite it, delete it, write into A's project,
-- plant a blob in A's storage folder, read A's plan or usage, promote
-- themselves to Pro. Each must fail. Then the sync contract itself:
-- versions, conflicts, tombstones, the change counter, and the plan
-- limits the server enforces rather than trusting the app to.
-- ============================================================

\set ON_ERROR_STOP 1
\set QUIET 1
-- Assertions print nothing useful row by row; only the tally at the end.
\o /dev/null

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.ok(cond boolean, name text) returns void
language plpgsql as $$
begin
  if cond is not true then
    raise exception 'FAIL: %', name;
  end if;
  perform set_config('tests.passed', (coalesce(nullif(current_setting('tests.passed', true), ''), '0')::int + 1)::text, false);
end
$$;

-- Runs `stmt` as whoever is currently logged in and insists it fails
-- with a message matching `pattern`. A statement that SUCCEEDS here is
-- the failure — it means the door was open.
create function tests.refused(stmt text, pattern text, name text) returns void
language plpgsql as $$
declare
  msg text;
begin
  begin
    execute stmt;
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg !~* pattern then
      raise exception 'FAIL: % (refused, but with "%" rather than /%/)', name, msg, pattern;
    end if;
    perform tests.ok(true, name);
    return;
  end;
  raise exception 'FAIL: % (the statement succeeded)', name;
end
$$;

-- How many rows an UPDATE/DELETE actually touched — RLS turns a
-- forbidden row into an invisible one, so "0" is the refusal.
create function tests.touched(stmt text) returns integer
language plpgsql as $$
declare
  n integer;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

create function tests.login(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);
end
$$;

create function tests.anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, false);
  perform set_config('role', 'anon', false);
end
$$;

create function tests.admin() returns void
language plpgsql as $$
begin
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claims', '', false);
end
$$;

grant execute on function tests.admin() to anon, authenticated;

-- A known hash for a known body, so tests don't hard-code hex.
create function tests.sha(body text) returns text
language sql immutable as $$ select encode(sha256(convert_to(body, 'UTF8')), 'hex') $$;
grant execute on function tests.sha(text) to anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com');

-- ============================================================
-- Projects
-- ============================================================

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');

insert into public.projects (id, name) values ('11111111-0000-0000-0000-00000000000a', 'Book A');

select tests.ok((select owner_id from public.projects where id = '11111111-0000-0000-0000-00000000000a')
                = 'aaaaaaaa-0000-0000-0000-000000000001', 'insert stamps the caller as owner');

select tests.ok((select seq from public.projects where id = '11111111-0000-0000-0000-00000000000a') = 0,
                'a new project starts its change counter at 0');

select tests.refused($$insert into public.projects (name) values ('Second book')$$,
  'plan_limit:projects', 'free plan refuses a second synced book');

select tests.refused($$insert into public.projects (id, name) values ('11111111-0000-0000-0000-00000000000a', 'Book A')$$,
  'duplicate key', 'a retried create at the limit fails as a duplicate, not as a plan limit');

select tests.refused($$update public.projects set seq = 99 where id = '11111111-0000-0000-0000-00000000000a'$$,
  'permission denied', 'a client cannot move its own change counter');

select tests.refused($$update public.projects set owner_id = 'bbbbbbbb-0000-0000-0000-000000000002'$$,
  'permission denied', 'a client cannot give a project away');

select tests.login('bbbbbbbb-0000-0000-0000-000000000002');

insert into public.projects (id, name) values ('22222222-0000-0000-0000-00000000000b', 'Book B');

select tests.ok((select count(*) from public.projects) = 1, 'B sees exactly one project');
select tests.ok((select name from public.projects) = 'Book B', 'and it is B''s own');

select tests.refused(
  $$insert into public.projects (id, name, owner_id) values (gen_random_uuid(), 'Planted', 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  'permission denied', 'B cannot create a project owned by A');

select tests.ok(tests.touched($$update public.projects set name = 'Stolen' where id = '11111111-0000-0000-0000-00000000000a'$$) = 0,
  'B renaming A''s project touches nothing');
select tests.ok(tests.touched($$delete from public.projects where id = '11111111-0000-0000-0000-00000000000a'$$) = 0,
  'B deleting A''s project touches nothing');

-- ============================================================
-- push_file: the sync contract
-- ============================================================

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');

select tests.ok(
  (select public.push_file('11111111-0000-0000-0000-00000000000a', 'Manuscript/01.md', 0,
     tests.sha('Once.'), false, 'Once.', null, 'desk')) = '{"ok": true, "seq": 1, "version": 1}'::jsonb,
  'first write lands as version 1, seq 1');

select tests.ok(
  (select public.push_file('11111111-0000-0000-0000-00000000000a', 'Manuscript/01.md', 1,
     tests.sha('Once upon.'), false, 'Once upon.', null, 'desk')) = '{"ok": true, "seq": 2, "version": 2}'::jsonb,
  'a write based on the current version lands');

select tests.ok(
  (select (public.push_file('11111111-0000-0000-0000-00000000000a', 'Manuscript/01.md', 1,
     tests.sha('Once, offline.'), false, 'Once, offline.', null, 'laptop')) ->> 'reason') = 'conflict',
  'a write based on a stale version is a conflict, not an overwrite');

select tests.ok(
  (select (public.push_file('11111111-0000-0000-0000-00000000000a', 'Manuscript/01.md', 1,
     tests.sha('Once, offline.'), false, 'Once, offline.', null, 'laptop')) -> 'current' ->> 'content') = 'Once upon.',
  'the conflict hands back the current text so nothing has to be guessed');

select tests.ok(
  (select content from public.project_files where path = 'Manuscript/01.md') = 'Once upon.',
  'the stale write changed nothing');

select tests.ok(
  (select (public.push_file('11111111-0000-0000-0000-00000000000a', 'Manuscript/02.md', 1,
     tests.sha('New.'), false, 'New.', null, 'desk')) ->> 'reason') = 'conflict',
  'claiming a base version for a file that does not exist is a conflict');

select tests.ok(
  (select (public.push_file('11111111-0000-0000-0000-00000000000a', 'Manuscript/01.md', 0,
     tests.sha('Fresh.'), false, 'Fresh.', null, 'phone')) ->> 'reason') = 'conflict',
  'creating a path another device already created is a conflict');

select tests.refused(
  $$select public.push_file('11111111-0000-0000-0000-00000000000a', 'Manuscript/03.md', 0,
     tests.sha('what was meant'), false, 'what arrived', null, 'desk')$$,
  'sha_mismatch', 'a body that does not match its hash is refused');

select tests.refused(
  $$select public.push_file('11111111-0000-0000-0000-00000000000a', '../escape.md', 0, tests.sha('x'), false, 'x')$$,
  'check constraint', 'a path climbing out of the project is refused');
select tests.refused(
  $$select public.push_file('11111111-0000-0000-0000-00000000000a', '/abs.md', 0, tests.sha('x'), false, 'x')$$,
  'check constraint', 'an absolute path is refused');
select tests.refused(
  $$select public.push_file('11111111-0000-0000-0000-00000000000a', E'win\\path.md', 0, tests.sha('x'), false, 'x')$$,
  'check constraint', 'a backslash path is refused');

-- Deletion is a tombstone, and a tombstone can be written over.
select tests.ok(
  (select public.push_file('11111111-0000-0000-0000-00000000000a', 'Manuscript/01.md', 2,
     '', true)) = '{"ok": true, "seq": 3, "version": 3}'::jsonb,
  'a delete based on the current version lands');
select tests.ok(
  (select deleted and content is null and size = 0 from public.project_files where path = 'Manuscript/01.md'),
  'a deleted file is a tombstone with no body');
select tests.refused(
  $$select public.push_file('11111111-0000-0000-0000-00000000000a', 'Manuscript/01.md', 3, '', true, 'body')$$,
  'deleted_with_body', 'a delete carrying a body is refused');
select tests.ok(
  (select public.push_file('11111111-0000-0000-0000-00000000000a', 'Manuscript/01.md', 3,
     tests.sha('Back.'), false, 'Back.', null, 'desk')) = '{"ok": true, "seq": 4, "version": 4}'::jsonb,
  'a deleted file can come back, as the next version');

select tests.refused(
  $$insert into public.project_files (project_id, owner_id, path, version, seq, sha256, size, content)
    values ('11111111-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'x.md', 1, 1, '', 0, '')$$,
  'permission denied', 'even the owner cannot write the files table around push_file');

-- ============================================================
-- B against A's files
-- ============================================================

select tests.login('bbbbbbbb-0000-0000-0000-000000000002');

select tests.ok((select count(*) from public.project_files) = 0, 'B sees none of A''s files');

select tests.refused(
  $$select public.push_file('11111111-0000-0000-0000-00000000000a', 'Manuscript/01.md', 4,
     tests.sha('Vandalised.'), false, 'Vandalised.')$$,
  'not_found', 'B pushing into A''s project is refused as not found');

select tests.refused(
  $$update public.project_files set content = 'Vandalised.' where path = 'Manuscript/01.md'$$,
  'permission denied', 'B cannot update A''s files directly');
select tests.refused(
  $$delete from public.project_files$$,
  'permission denied', 'B cannot delete A''s files directly');

select tests.ok(
  (select public.push_file('22222222-0000-0000-0000-00000000000b', 'Manuscript/01.md', 0,
     tests.sha('B''s own.'), false, 'B''s own.', null, 'desk')) = '{"ok": true, "seq": 1, "version": 1}'::jsonb,
  'B''s change counter is B''s project''s alone');

-- ============================================================
-- Storage
-- ============================================================

select tests.refused(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('vault', 'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000000a/deadbeef', '{"size": 1}')$$,
  'row-level security', 'B cannot plant a blob in A''s folder');

select tests.admin();
insert into storage.objects (bucket_id, name, metadata) values
  ('vault', 'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000000a/c0ffee', '{"size": 2048}');
select tests.login('bbbbbbbb-0000-0000-0000-000000000002');
select tests.ok((select count(*) from storage.objects) = 0, 'B cannot list A''s blobs');
select tests.ok(tests.touched($$delete from storage.objects$$) = 0, 'B cannot delete A''s blobs');

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.ok((select count(*) from storage.objects) = 1, 'A sees A''s blob');

insert into storage.objects (bucket_id, name, metadata) values
  ('vault', 'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000000a/beef', '{"size": 4096}');

select tests.ok(
  (select public.push_file('11111111-0000-0000-0000-00000000000a', '.novella/cover.jpg', 0,
     'beef', false, null, 'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000000a/beef')) ->> 'ok' = 'true',
  'a blob in the caller''s own folder can be pushed');
select tests.ok(
  (select size from public.project_files where path = '.novella/cover.jpg') = 4096,
  'a blob''s size comes from storage, not from the client');
select tests.refused(
  $$select public.push_file('11111111-0000-0000-0000-00000000000a', 'x.jpg', 0, 'feed', false, null,
     'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000000a/feed')$$,
  'blob_missing', 'pointing at a blob that was never uploaded is refused');
select tests.refused(
  $$select public.push_file('11111111-0000-0000-0000-00000000000a', 'y.jpg', 0, 'beef', false, null,
     'bbbbbbbb-0000-0000-0000-000000000002/22222222-0000-0000-0000-00000000000b/beef')$$,
  'blob_key', 'pointing a file at a blob outside the caller''s folder is refused');

-- ============================================================
-- Plans, entitlements, usage
-- ============================================================

select tests.refused(
  $$insert into public.entitlements (user_id, tier) values ('aaaaaaaa-0000-0000-0000-000000000001', 'pro')$$,
  'permission denied', 'nobody can grant themselves Pro');
select tests.refused(
  $$select public.effective_tier_for('bbbbbbbb-0000-0000-0000-000000000002')$$,
  'permission denied', 'nobody can look up another account''s plan');
select tests.refused(
  $$select public.record_ai_usage('aaaaaaaa-0000-0000-0000-000000000001', -5000000, 0, 0)$$,
  'permission denied', 'nobody can write their own AI meter');

select tests.ok((select public.my_account() ->> 'tier') = 'free', 'A starts on free');
select tests.ok((select (public.my_account() ->> 'bytes_used')::bigint)
                = octet_length('Back.') + 4096, 'usage counts live files and blobs, not tombstones');

-- Quota: plant a 99 MB file as the admin, then try to grow past 100 MB.
select tests.admin();
insert into storage.objects (bucket_id, name, metadata) values
  ('vault', 'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000000a/big', '{"size": 103800000}'),
  ('vault', 'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000000a/big2', '{"size": 2000000}');
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.ok(
  (select public.push_file('11111111-0000-0000-0000-00000000000a', 'research.pdf', 0, 'big', false, null,
     'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000000a/big')) ->> 'ok' = 'true',
  'a write under the storage cap lands');
select tests.ok(
  (select public.push_file('11111111-0000-0000-0000-00000000000a', 'more.pdf', 0, 'big2', false, null,
     'aaaaaaaa-0000-0000-0000-000000000001/11111111-0000-0000-0000-00000000000a/big2')) ->> 'limit' = 'bytes',
  'a write that would cross the storage cap is refused as a limit');
select tests.ok(
  (select public.push_file('11111111-0000-0000-0000-00000000000a', 'Manuscript/01.md', 4,
     tests.sha('B.'), false, 'B.', null, 'desk')) ->> 'ok' = 'true',
  'a shrinking write still lands when the account is near its cap');

-- Upgrade: A becomes Pro and can sync more books.
select tests.admin();
insert into public.entitlements (user_id, tier, status, current_period_end, provider)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'pro', 'active', now() + interval '30 days', 'paddle');
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.ok((select public.my_account() ->> 'tier') = 'pro', 'the webhook''s row makes A Pro');
select tests.ok((select count(*) from public.entitlements) = 1, 'A reads A''s own entitlement');
select tests.refused(
  $$insert into public.projects (id, name, owner_id) values ('33333333-0000-0000-0000-00000000000c', 'x', auth.uid())$$,
  'permission denied', 'owner_id is not a column a client may set, even to itself');
insert into public.projects (id, name) values ('33333333-0000-0000-0000-00000000000c', 'Book A2');
insert into public.projects (id, name) values ('44444444-0000-0000-0000-00000000000d', 'Book A3');
select tests.ok((select count(*) from public.projects) = 3, 'Pro syncs more than one book');

select tests.login('bbbbbbbb-0000-0000-0000-000000000002');
select tests.ok((select count(*) from public.entitlements) = 0, 'B cannot see A''s subscription');
select tests.ok((select public.my_account() ->> 'tier') = 'free', 'A''s plan does not leak into B''s');

-- Downgrade: past the grace window A is free again with three books.
select tests.admin();
update public.entitlements set status = 'canceled' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.ok(
  (select public.push_file('11111111-0000-0000-0000-00000000000a', 'Manuscript/09.md', 0,
     tests.sha('Still mine.'), false, 'Still mine.', null, 'desk')) ->> 'ok' = 'true',
  'after a downgrade the oldest book keeps syncing');
select tests.ok(
  (select public.push_file('33333333-0000-0000-0000-00000000000c', 'Manuscript/01.md', 0,
     tests.sha('Paused.'), false, 'Paused.', null, 'desk')) ->> 'limit' = 'projects',
  'books past the free count pause instead of vanishing');
select tests.ok((select count(*) from public.projects) = 3, 'and every book is still readable');

-- Grace: past_due inside the window keeps Pro.
select tests.admin();
update public.entitlements set status = 'past_due', current_period_end = now() - interval '2 days'
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.ok((select public.my_account() ->> 'tier') = 'pro', 'a failed card keeps Pro for a week');
select tests.admin();
update public.entitlements set current_period_end = now() - interval '8 days'
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.ok((select public.my_account() ->> 'tier') = 'free', 'and not for longer');

-- AI metering accumulates per calendar month, written only by the server.
select tests.admin();
select public.record_ai_usage('aaaaaaaa-0000-0000-0000-000000000001', 1500, 6000, 800);
select public.record_ai_usage('aaaaaaaa-0000-0000-0000-000000000001', 2500, 6000, 800);
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.ok((select (public.my_account() ->> 'ai_used_microusd')::bigint) = 4000, 'AI usage accumulates');
select tests.ok((select requests from public.ai_usage) = 2, 'and counts requests');
select tests.login('bbbbbbbb-0000-0000-0000-000000000002');
select tests.ok((select count(*) from public.ai_usage) = 0, 'B cannot see A''s AI usage');

-- ============================================================
-- Settings
-- ============================================================

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.ok((select public.put_settings(0, '{"theme": "vellum"}')) = '{"ok": true, "version": 1}'::jsonb,
  'first settings write lands');
select tests.ok((select public.put_settings(0, '{"theme": "ink"}') ->> 'reason') = 'conflict',
  'a stale settings write is a conflict');
select tests.ok((select public.put_settings(0, '{"theme": "ink"}') -> 'current' -> 'doc' ->> 'theme') = 'vellum',
  'and hands back what is there');
select tests.refused($$select public.put_settings(1, '[1,2]')$$, 'not_an_object', 'settings must be an object');
select tests.login('bbbbbbbb-0000-0000-0000-000000000002');
select tests.ok((select count(*) from public.user_settings) = 0, 'B cannot read A''s settings');
select tests.ok((select public.put_settings(0, '{"theme": "noir"}')) ->> 'ok' = 'true',
  'B''s settings are B''s own row');

-- ============================================================
-- Signed out
-- ============================================================

select tests.anon();
select tests.refused($$select count(*) from public.projects$$, 'permission denied', 'signed out: no projects');
select tests.refused($$select count(*) from public.project_files$$, 'permission denied', 'signed out: no files');
select tests.refused($$select count(*) from public.user_settings$$, 'permission denied', 'signed out: no settings');
select tests.refused(
  $$select public.push_file('11111111-0000-0000-0000-00000000000a', 'x.md', 0, tests.sha('x'), false, 'x')$$,
  'permission denied', 'signed out: no writes');
select tests.ok((select count(*) from public.plan_limits) = 3, 'signed out: the price list is public');
select tests.ok((select count(*) from storage.objects) = 0, 'signed out: no blobs');

select tests.admin();
\o
select 'isolation_test: ' || current_setting('tests.passed') || ' checks passed' as result;
