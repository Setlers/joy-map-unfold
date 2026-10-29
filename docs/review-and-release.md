# Emotion map reliability changes

Submissions must pass through server moderation. Three migrations restrict direct
inserts, add a shared one-minute submission limit, and enforce one-decimal
coordinates. The UI distinguishes loading, empty data, failed reads and interrupted
live updates; retries and reconnects reload the feed. Summaries describe the loaded
sample and include ties. Audio reports actual playback and supports another source.

## Validation

Node 24 is used for the TypeScript test runner. From the repository root:

```sh
npm test
npm run typecheck
npm run build
```

There are 76 tests across six files. `npm run lint` still reports existing
formatting issues and a `prefer-const` error in the generated Supabase preview
storage code; do not treat this as a clean global lint baseline.

Optional isolated database checks use PostgreSQL roles matching Supabase. They do
not connect to the live project. Dependencies are installed outside the checkout:

```sh
npm install --prefix /tmp/joy-postgres --no-package-lock --no-audit --no-fund embedded-postgres@18.4.0-beta.17
node scripts/check-database.mjs
```

The script starts a temporary local cluster on port 55439, applies migrations,
runs the SQL access/rate/coordinate checks, and races 20 independent connections
for a fresh and an expired slot. Exactly one claim must succeed in each race.
It stops the cluster on completion. Override `POSTGRES_TEST_TOOLS` or
`TEST_POSTGRES_PORT` if needed. Do not run it as root.

Browser checks require Chromium and a running development server. They intercept
remote services and use fixtures, including failures; they never submit emotions
or contact the production database:

```sh
npm install --prefix /tmp/joy-browser --no-package-lock --no-audit --no-fund playwright-core@1.56.1
# In another terminal: npm run dev -- --host 127.0.0.1 --port 3000
node scripts/check-browser.mjs
```

The script checks errors, retries, markers, tied summaries, Slovak filters, audio
failure and mobile layout. Set `CHROMIUM_PATH` or `BROWSER_TEST_TOOLS` if needed.
These checks do not establish production Realtime or successful audio playback.

## Release order

1. Verify the **deployment's** server-only `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`. A configured key in the Codex environment alone
   does not verify the Lovable deployment. Never expose the service key as VITE_*.
   Lovable reports that its Cloud runtime injects these automatically; managed
   secrets may not appear in the editable Secrets list. Do not replace them based
   on the separate Codex environment's authentication failure. The privileged
   database client and request helpers are loaded only inside the server handler.
2. Verify the hosting provider's client-address propagation. By default forwarded
   headers are ignored. Only enable `EMOTION_TRUST_CLOUDFLARE_IP=true` if the
   origin is protected and Cloudflare overwrites that header. Missing addresses
   share one restrictive bucket. See [database checks](../supabase/tests/README.md).
3. Retain a database backup before applying migrations. Coordinate backfill
   irreversibly reduces existing precision. Apply the three October 29 migrations
   in order **before** deploying the updated server; the new server rejects
   submissions when the limit RPC is unavailable.
4. Deploy code from the reviewed branch. Keep database rollout separate from the
   branch review; syncing files to GitHub is not evidence migrations were applied.
5. In a staging project, verify one submission, immediate rejection of a second
   after clearing cookies, and successful submission after one minute. Verify
   two clients see new records and recovery after a connection interruption.
6. Verify the actual audio source in a target browser. The original MP3 is not
   bundled; see [audio configuration](ambient-audio.md). Audio portability remains
   unverified until that asset can be retrieved or a public source is supplied.

Do not merge to the Lovable-connected main branch until the database and hosting
requirements have been checked. No production migrations or deployment are
performed by the validation scripts above.
