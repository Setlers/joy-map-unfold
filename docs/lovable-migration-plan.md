# Lovable Cloud: deployment checkpoint

The project owner has added `EMOTION_TRUST_CLOUDFLARE_IP=true` to Lovable.
Changing the setting affects preview immediately according to the Lovable UI;
production requires publication. Actual visitor-address propagation still needs
verification in preview. No live database change is authorized by this document.

## Before applying SQL

1. Ask Lovable to confirm an existing restorable database backup/snapshot, its
   date, and the supported restore procedure. Do not assume the GitHub PR or
   publishing the Codex environment backs up the database.
2. Run only `supabase/deployment-preflight.sql` through the authorized Lovable
   database tool and inspect the results. It is read-only; `records_to_round`
   shows how many rows lose coordinate precision in migration 3. Message contents
   are not returned. The count scans the emotions table; allow for its size.
3. If either rate-limit object already exists, stop and check migration history
   before applying anything. Migration 2 intentionally creates new objects;
   blindly replaying it or hiding drift with IF NOT EXISTS is not appropriate.

## Exact migration order (after backup and explicit release approval)

1. `20261029080000_restrict_emotion_inserts.sql`: remove browser INSERT grants
   and the old public insert policy. Keep public SELECT and service-role INSERT.
   Existing main already writes through its server-side service-role client.
2. `20261029081000_add_emotion_rate_limit.sql`: create the private limit table,
   enable RLS, and expose its claim function only to the server role.
3. `20261029082000_unify_coordinate_precision.sql`: round existing coordinates
   to one decimal and replace the sanitizer for future inserts and updates.
   IDs, timestamps and message text are preserved; precision cannot be restored
   without the pre-migration backup.

Use Lovable's supported migration process and record these exact versions in
migration history. Do not manually paste SQL and leave the migration runner
believing those versions are unapplied. Each file is its own transaction; the
three-file rollout is not a single atomic transaction. If a file fails, inspect
the error and history before resuming; previously committed files remain applied.

## After SQL, before publication

Run the read-only check again. Both rate objects should exist, both public INSERT
grant fields should be false, public read/server INSERT should be true, and
`records_to_round` should be zero. The trigger should cover INSERT and UPDATE.
These checks do not verify backups, hosting credentials or successful writes.

Then review/merge PR #1, verify the new code in the Lovable preview, and perform
the staging submission/rate/reconnect checks in `review-and-release.md`. Do not
publish the live app until those checks pass. Without a separate staging database,
even preview submissions change the live database and need explicit authorization.
