import { Pool, type PoolClient } from "pg";
import { databaseConfig } from "@/lib/database-config";
let pool: Pool;
export function db() {
  return (pool ??= new Pool({
    ...databaseConfig(process.env.DATABASE_URL),
    max: 8,
  }));
}
export async function transaction<T>(
  actor: string | null,
  run: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('hk.actor',$1,true)", [actor ?? ""]);
    const result = await run(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
