import { Pool } from "pg";
import { databaseConfig } from "@/lib/database-config";
let pool: Pool;
let last = 0;
// Additional traffic-triggered purge; it supplements, never substitutes for, an hourly scheduler.
export async function ensureCleanup() {
  if (Date.now() - last < 60000) return;
  const p = (pool ??= new Pool({
    ...databaseConfig(process.env.MAINTENANCE_DATABASE_URL),
    max: 1,
  }));
  await p.query("SELECT hk.cleanup()");
  last = Date.now();
}
