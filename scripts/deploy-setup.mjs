// Operator-only setup for a newly provisioned synthetic Supabase project.
// Run as a staged build; remove bootstrap/provider admin credentials before release.
import { readFileSync, readdirSync } from "node:fs";
import { Pool } from "pg";
import { databaseConfig } from "../src/lib/database-config.ts";
const ref = process.env.HK_EXPECTED_PROJECT;
const base = process.env.SUPABASE_URL;
if (
  !ref ||
  base !== `https://${ref}.supabase.co` ||
  process.env.DEMO_MODE !== "true"
)
  throw Error("Explicit synthetic project binding required.");
const url = new URL(process.env.POSTGRES_URL_NON_POOLING);
if (!decodeURIComponent(url.username).endsWith(`.${ref}`))
  throw Error("Database target mismatch.");
url.searchParams.set("sslmode", "verify-full");
const pool = new Pool({
  ...databaseConfig(url.toString()),
  max: 1,
  connectionTimeoutMillis: 20000,
});
const c = await pool.connect();
try {
  await c.query("BEGIN");
  const existing = await c.query(
    "SELECT to_regclass('hk.clinics') AS table_name",
  );
  if (!existing.rows[0].table_name) {
    const ext = await c.query(
      "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto'",
    );
    const schema = ext.rows[0]?.nspname ?? "public";
    if (!/^[a-z_]+$/.test(schema))
      throw Error("Unexpected extension namespace.");
    for (const file of readdirSync("database")
      .filter((f) => /^\d{3}.*\.sql$/.test(f))
      .sort()) {
      const sql = readFileSync(`database/${file}`, "utf8").replaceAll(
        "public.gen_random_bytes",
        `${schema}.gen_random_bytes`,
      );
      await c.query(sql);
    }
  }
  for (const [role, key] of [
    ["healthkey_app", "HK_APP_PASSWORD"],
    ["healthkey_maintenance", "HK_MAINTENANCE_PASSWORD"],
  ]) {
    const password = process.env[key];
    if (!password || !/^[a-f0-9]{48}$/.test(password))
      throw Error("Missing bootstrap role credential.");
    await c.query(`ALTER ROLE ${role} PASSWORD '${password}'`);
  }
  const { settings, services } = JSON.parse(
    readFileSync("database/demo-config.json", "utf8"),
  );
  const clinic = "11111111-1111-4111-8111-111111111111",
    other = "22222222-2222-4222-8222-222222222222";
  for (const [id, code, name] of [
    [clinic, "HK001", settings.name],
    [other, "HK002", "Second Demo Clinic"],
  ]) {
    await c.query(
      "INSERT INTO hk.clinics(id,code,name,settings) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
      [id, code, name, { ...settings, name }],
    );
    for (const [i, s] of services.entries())
      await c.query(
        "INSERT INTO hk.services(clinic_id,key,icon,sort_order,labels,help) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(clinic_id,key) DO NOTHING",
        [
          id,
          s[0],
          s[1],
          i,
          { en: s[2], sn: s[3], nd: s[4] },
          { en: s[5], sn: s[6], nd: s[7] },
        ],
      );
  }
  // Do not hold catalog/DDL locks while the auth service accesses PostgreSQL.
  await c.query("COMMIT");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !process.env.HK_DEMO_PASSWORD)
    throw Error("Missing onboarding credentials.");
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const response = await fetch(`${base}/auth/v1/admin/users`, { headers });
  if (!response.ok) throw Error(`Auth list failed (${response.status}).`);
  const { users } = await response.json();
  for (const [role, name, cid] of [
    ["intake", "Intake staff", clinic],
    ["clinician", "Counsellor", clinic],
    ["admin", "Clinic administrator", clinic],
    ["other", "Other clinic intake", other],
    ["platform", "Platform operator", clinic],
  ]) {
    const email = `${role}@healthkey.test`;
    let u = users.find((u) => u.email === email);
    if (!u) {
      const r = await fetch(`${base}/auth/v1/admin/users`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email,
          password: process.env.HK_DEMO_PASSWORD,
          email_confirm: true,
        }),
      });
      if (!r.ok) throw Error(`Auth onboarding failed (${r.status}).`);
      u = await r.json();
    }
    const ids = await c.query(
      "SELECT id FROM hk.services WHERE clinic_id=$1 AND key='mental_health'",
      [cid],
    );
    await c.query(
      "INSERT INTO hk.staff_users(id,clinic_id,name,role,service_ids) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
      [
        u.id,
        cid,
        name,
        role === "other" ? "intake" : role,
        role === "clinician" ? [ids.rows[0].id] : [],
      ],
    );
  }
  await c.query(
    "CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog",
  );
  await c.query(
    "SELECT cron.schedule('healthkey-cleanup','* * * * *','SELECT hk.cleanup()')",
  );
  await c.query("SELECT hk.cleanup()");
  const checkpoint = (await c.query("SELECT last_cleanup FROM hk.maintenance"))
    .rows[0].last_cleanup;
  let schedulerVerified = false;
  for (let attempt = 0; attempt < 14; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const r = await c.query(
      "SELECT last_cleanup > $1 AS advanced FROM hk.maintenance",
      [checkpoint],
    );
    if (r.rows[0].advanced) {
      schedulerVerified = true;
      break;
    }
  }
  if (!schedulerVerified)
    throw Error("Database cleanup scheduler did not run within 70 seconds.");
  console.log("Automatic database cleanup execution verified.");
  // Verify restricted credentials independently; do not validate only as owner.
  for (const key of ["DATABASE_URL", "MAINTENANCE_DATABASE_URL"]) {
    const restricted = new Pool({
      ...databaseConfig(process.env[key]),
      max: 1,
      connectionTimeoutMillis: 20000,
    });
    try {
      const r = await restricted.query(
        "SELECT current_user, hk.healthy() AS healthy",
      );
      if (!r.rows[0].healthy) throw Error("Cleanup health failed.");
      console.log(`${r.rows[0].current_user}: verified`);
    } finally {
      await restricted.end();
    }
  }
  console.log(
    "Hosted synthetic schema, staff accounts and one-minute database cleanup ready.",
  );
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.error("Hosted setup failed:", e.code ?? e.name, e.message);
  process.exitCode = 1;
} finally {
  c.release();
  await pool.end();
}
