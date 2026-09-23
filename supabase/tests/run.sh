#!/usr/bin/env bash
# Runs the cloud schema's isolation tests against a throwaway database.
#
#   PGHOST=/tmp PGPORT=54329 PGUSER=postgres supabase/tests/run.sh
#
# Needs a Postgres 15+ server you are allowed to create databases on
# (sha256() and gen_random_uuid() are built in from 13/11). It creates
# a fresh database, loads the Supabase stub and the migrations in
# order, runs the tests, and drops the database again — pass KEEP=1 to
# leave it for poking at.
#
# Not part of `npm run verify`: CI has no Postgres, and a gate that
# skips itself when the server is missing would report green for a
# test that never ran. Run it by hand whenever the migration changes.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
db="novella_cloud_test_$$"

psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database $db"
cleanup() {
  if [ "${KEEP:-0}" != "1" ]; then
    psql -q -d postgres -c "drop database if exists $db" >/dev/null
  else
    echo "kept database $db"
  fi
}
trap cleanup EXIT

psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$here/supabase_stub.sql"
for migration in "$here"/../migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -q -d "$db" -f "$migration"
done
psql -v ON_ERROR_STOP=1 -q -X -t -A -d "$db" -f "$here/isolation_test.sql"
PGDATABASE="$db" npx tsx "$here/contract.ts"
