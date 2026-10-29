import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const dbTools = createRequire(
  `${process.env.POSTGRES_TEST_TOOLS ?? "/tmp/joy-postgres"}/package.json`,
);
const { default: EmbeddedPostgres } = await import(
  pathToFileURL(dbTools.resolve("embedded-postgres")).href
);
import { randomUUID } from "node:crypto";
import { readFile, readdir, mkdtemp } from "node:fs/promises";
const root = fileURLToPath(new URL("../supabase", import.meta.url));
const dir = await mkdtemp("/tmp/joy-real-pg-");
const pg = new EmbeddedPostgres({
  databaseDir: dir + "/data",
  port: Number(process.env.TEST_POSTGRES_PORT ?? 55439),
  user: "postgres",
  password: randomUUID(),
  persistent: false,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
const clients = [];
try {
  await pg.initialise();
  await pg.start();
  const owner = pg.getPgClient();
  clients.push(owner);
  await owner.connect();
  await owner.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
 CREATE PUBLICATION supabase_realtime;`);
  const verifyPreflight = async (expected) => {
    const results = await owner.query(await readFile(root + "/deployment-preflight.sql", "utf8"));
    const row = results
      .flatMap((result) => result.rows ?? [])
      .find((row) => row.check_name === "migration_objects");
    if (!row || row.rate_table_exists !== expected || row.rate_function_exists !== expected)
      throw Error("Preflight returned an unexpected migration state");
    console.log(
      `PASS PostgreSQL: read-only preflight (${expected ? "after" : "before"} release migrations)`,
    );
  };
  for (const file of (await readdir(root + "/migrations")).sort()) {
    if (file === "20261029080000_restrict_emotion_inserts.sql") await verifyPreflight(false);
    await owner.query(await readFile(root + "/migrations/" + file, "utf8"));
  }
  await verifyPreflight(true);
  for (const file of [
    "emotion_insert_access.sql",
    "emotion_rate_limit.sql",
    "coordinate_precision.sql",
    "running_together.sql",
  ]) {
    await owner.query(await readFile(root + "/tests/" + file, "utf8"));
    console.log("PASS PostgreSQL: " + file);
  }
  const workers = await Promise.all(
    Array.from({ length: 20 }, async () => {
      const c = pg.getPgClient();
      clients.push(c);
      await c.connect();
      await c.query("SET ROLE service_role");
      return c;
    }),
  );
  const run = async (label) => {
    const results = await Promise.all(
      workers.map((c) => c.query("SELECT public.claim_emotion_submission(repeat('d',64)) AS wait")),
    );
    const admitted = results.filter((r) => r.rows[0].wait === 0).length;
    if (admitted !== 1) throw Error(label + ": admitted " + admitted);
    console.log("PASS PostgreSQL: " + label + " admits 1 of 20 concurrent connections");
  };
  const trainingClaims = await Promise.all(
    workers.map((c) =>
      c.query(
        "SELECT public.start_training(repeat('1',64),repeat('2',64),48.15,17.15,30,NULL) AS result",
      ),
    ),
  );
  if (trainingClaims.filter((r) => r.rows[0].result.ok).length !== 1)
    throw Error("Concurrent duplicate training starts");
  const sessionId = trainingClaims.find((r) => r.rows[0].result.ok).rows[0].result.session.id;
  const cheers = await Promise.all(
    workers.map((c) =>
      c.query("SELECT public.cheer_training(repeat('3',64),repeat('4',64),$1::uuid) AS result", [
        sessionId,
      ]),
    ),
  );
  if (cheers.filter((r) => r.rows[0].result.ok).length !== 1)
    throw Error("Concurrent duplicate cheers");
  console.log("PASS PostgreSQL: 20 concurrent starts/cheers each accept exactly one");
  const sharedIpClaims = await Promise.all(
    workers.map((c, index) =>
      c.query("SELECT public.start_training($1,repeat('5',64),48,17,30,NULL) AS result", [
        (index + 100).toString(16).padStart(64, "0"),
      ]),
    ),
  );
  if (sharedIpClaims.filter((r) => r.rows[0].result.ok).length !== 1)
    throw Error("Training IP limit bypassed by parallel identities");
  console.log("PASS PostgreSQL: shared-IP start limit survives 20 distinct identities");
  await run("fresh slot");
  await owner.query(
    "UPDATE public.emotion_rate_limits SET blocked_until=clock_timestamp()-interval '1 second'",
  );
  await run("expired slot");
} finally {
  await Promise.allSettled(clients.map((c) => c.end()));
  await pg.stop();
}
