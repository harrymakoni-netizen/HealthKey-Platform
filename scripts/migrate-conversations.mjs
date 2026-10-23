import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { databaseConfig } from "../src/lib/database-config.ts";
const url = new URL(process.env.HK_MIGRATION_URL);
if (
  process.env.DEMO_MODE !== "true" ||
  decodeURIComponent(url.username) !== "postgres.gpgjciongqmwrvkvckfj" ||
  url.hostname !== "aws-0-eu-west-2.pooler.supabase.com"
)
  throw Error("Unexpected migration target.");
const pool = new Pool({
  ...databaseConfig(url.toString()),
  max: 1,
  connectionTimeoutMillis: 20000,
});
const c = await pool.connect();
try {
  await c.query("BEGIN");
  if (
    !(await c.query("SELECT to_regclass('hk.request_messages') AS t")).rows[0].t
  )
    await c.query(readFileSync("database/009_conversations.sql", "utf8"));
  await c.query("COMMIT");
  const result = await c.query(
    "SELECT relrowsecurity FROM pg_class WHERE oid='hk.request_messages'::regclass",
  );
  if (!result.rows[0].relrowsecurity)
    throw Error("Message authorization policy missing.");
  console.log(
    "Ephemeral conversation migration applied with row-level security.",
  );
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.error("Conversation migration failed:", e.code ?? e.name);
  process.exitCode = 1;
} finally {
  c.release();
  await pool.end();
}
