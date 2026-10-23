import { Pool } from "pg";
import { databaseConfig } from "../src/lib/database-config";
const pool = new Pool({
  ...databaseConfig(process.env.MAINTENANCE_DATABASE_URL),
});
async function run() {
  const r = await pool.query("SELECT hk.cleanup() AS deleted");
  console.log(
    `Cleanup finished: ${r.rows[0].deleted} expired or closed records removed.`,
  );
}
await run();
if (process.argv.includes("--watch"))
  setInterval(
    () =>
      run().catch(() =>
        console.error("Cleanup failed; inspect database availability."),
      ),
    60_000,
  );
else await pool.end();
