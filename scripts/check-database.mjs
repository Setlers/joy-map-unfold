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
  for (const file of (await readdir(root + "/migrations")).sort())
    await owner.query(await readFile(root + "/migrations/" + file, "utf8"));
  for (const file of [
    "emotion_insert_access.sql",
    "emotion_rate_limit.sql",
    "coordinate_precision.sql",
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
  await run("fresh slot");
  await owner.query(
    "UPDATE public.emotion_rate_limits SET blocked_until=clock_timestamp()-interval '1 second'",
  );
  await run("expired slot");
} finally {
  await Promise.allSettled(clients.map((c) => c.end()));
  await pg.stop();
}
