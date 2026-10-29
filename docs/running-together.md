# Running together: "Netrénuješ sám"

The `/running` route is a separate mode alongside the existing feelings map.
The feature branch includes the previously published sharing work; it does not
remove or replace that experience.

## First version

- Select an approximate point, an optional nickname (30 characters), and 30,
  60 or 90 minutes. No GPS permission, live route, speed or background tracking.
- The shared map shows declared active training states. These are not verified
  activity or distinct-person counts. The view loads the newest 1,000 active
  states; the label refers to the displayed map, not a global census.
- Anonymous ownership uses a 256-bit random token retained in local storage.
  Only a domain-separated hash is stored in a private table. The raw token is
  sent in POST bodies to the server, never in links or public records. It acts
  as a bearer credential: do not log or share it. There is no cross-device
  recovery, and clearing storage loses the controls. Expiry still works.
- A browser can restore and end its own state; another browser cannot. Ending
  is idempotent. Only one active state per token is permitted, and starts are
  limited to once per minute per token and network address. Rotating networks
  remains possible without account identity verification.
- Encouragement counts are deduplicated per training and network address,
  including under concurrent requests. People sharing a network share this
  allowance. These are encouragements, not verified unique people. Self-cheers
  from the owner's token are rejected; anonymous identity is not proof of person.
- Ended and expired sessions are excluded by database RLS. Public records contain
  no owner/visitor hashes. Private tables are not included in Realtime. The map
  polls every 15 seconds and on returning to the tab; public inserts and updates
  also request a refresh via Realtime. Local expiry is checked every 10 seconds.
  End/expiry visibility does not depend on a delete event being delivered.
- After finishing or expiring, the owner can open the feelings map to share a
  post-run feeling. Native sharing invites others to `/running` and includes no
  nickname, ownership token, coordinates, or session identifier.

Coordinates are rounded once in PostgreSQL to one decimal; longitude 180 maps
to -180. This is an approximate grid, not a guaranteed anonymity radius.
Nicknames are voluntary public text and can identify a person; no verified
identity is implied. Tooltip and card text use safe DOM/React text rendering.

Expired records become unreadable to public roles immediately. Sessions older
than 24 hours past expiry are physically deleted on a later start, cascading
encouragements; orphaned old ownership rows are also cleaned up. This is
opportunistic cleanup, not a scheduled retention guarantee.

## Validation

`npm test` covers state expiry, token recovery, storage failure and record parsing.
Use `npm run typecheck` and `npm run build` as usual. Existing global lint issues
remain outside this feature; the new runtime code has targeted ESLint checks.

With the isolated tools documented in `review-and-release.md`:

```sh
node scripts/check-database.mjs
# Dev server at http://127.0.0.1:3000:
node scripts/check-running.mjs
```

`POSTGRES_TEST_TOOLS` and `BROWSER_TEST_TOOLS` can point to tool installations
outside `/tmp` when the environment cleans temporary files. SQL tests run only
in a disposable PostgreSQL cluster. Browser submissions are intercepted; no live
data is written. Tests cover public read/private ownership, foreign-end rejection,
invalid duration, repeat starts and cheers, expiry, reload, errors, post-run
navigation, mobile layout, and races of 20 starts/cheers. These are not evidence
of a successful production migration or actual mobile native sharing.

## Deployment is a separate step

1. Review the one new migration `20261029120000_running_together.sql`. It depends
   on the already deployed `claim_emotion_submission` function, adds three tables,
   their access rules, four server RPCs and a coordinate trigger. It neither
   rewrites nor deletes existing emotion records. Apply it through the migration
   runner and record the version; do not blindly replay CREATE statements.
2. Keep the existing server-only Supabase credentials and confirmed
   `EMOTION_TRUST_CLOUDFLARE_IP=true` deployment configuration. If the visitor IP
   is unavailable, a shared restrictive bucket is used, not forwarded headers.
3. Apply the migration before enabling the route for users. Until then the UI
   shows unavailable training data and cannot start a training state.
4. Verify with two staging browsers: start, reload to regain controls, cheer from
   the second browser, reject a repeated cheer, end from the owner and observe
   disappearance. Inspect actual mobile placement and share-sheet behavior.
   Without a separate staging database, these checks write live records and
   should be intentionally labeled and authorized.
5. Publish only after review. No live migration, merge or publication has been
   performed as part of preparing this branch.

The fixed running-route metadata and interface support Slovak and English. There
is no country geocoder, account, club membership, chat, ranking or Strava
integration in this version. Those can follow evidence that runners return.
