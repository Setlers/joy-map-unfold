# Submission access and rate limit checks

Apply migrations in filename order to an isolated PostgreSQL/Supabase database,
then run these scripts as the migration owner (never against production):

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/emotion_insert_access.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/emotion_rate_limit.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/coordinate_precision.sql
node --experimental-strip-types tests/emotion-rate-limit.test.ts
node --experimental-strip-types tests/coordinates.test.ts
```

SQL checks roll back their data. The database must have the standard Supabase
roles (`anon`, `authenticated`, `service_role` with BYPASSRLS).

## Deployment

Apply all October 29 migrations before deploying the updated server. The server
requires its existing `SUPABASE_SERVICE_ROLE_KEY`; no key belongs in browser code.
If the rate limit RPC is missing or unavailable, submissions fail closed.

The limit is one accepted attempt per minute per network address, shared across
server instances. Invalid text is rejected before consuming a slot; duplicate
text or a failed database save can consume one. Users sharing an address share
the limit; changing networks can evade it. This is abuse mitigation, not identity
verification. IP digests are pseudonymous, not proof of anonymity; expired rows
are deleted on the next claim, not by a scheduled retention job.

By default, use the runtime's direct client address, ignoring forwarded headers.
Only set `EMOTION_TRUST_CLOUDFLARE_IP=true` when the deployment guarantees that
Cloudflare overwrites `CF-Connecting-IP` and direct origin access is blocked.
Verify this guarantee with the hosting provider before enabling it. An unknown
or invalid address uses one shared bucket rather than disabling protection.
Verify client-address propagation in the deployed preview before release, since
a runtime without it will place all visitors in that shared bucket.

The coordinate migration rounds existing and future coordinates to one decimal
place and maps +180 longitude to -180. Existing precision is irreversibly reduced
when this migration is applied; retain the normal database backup before release.
IDs, timestamps and messages remain unchanged. Only the database rounds incoming
coordinates, avoiding disagreement between JavaScript and PostgreSQL at negative
halfway values. The grid is not a guaranteed anonymity radius: longitude distances
depend on latitude, and a user's optional message may disclose their location.
