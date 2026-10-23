import { randomBytes, createHmac } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
mkdirSync(".local", { recursive: true });
if (!existsSync(".local/secrets.json"))
  writeFileSync(
    ".local/secrets.json",
    JSON.stringify({
      db: randomBytes(24).toString("hex"),
      app: randomBytes(24).toString("hex"),
      jwt: randomBytes(40).toString("hex"),
      cron: randomBytes(32).toString("hex"),
      password: randomBytes(15).toString("base64url"),
    }),
    { mode: 0o600 },
  );
const s = JSON.parse(readFileSync(".local/secrets.json", "utf8"));
if (!s.maintenance) {
  s.maintenance = randomBytes(24).toString("hex");
  writeFileSync(".local/secrets.json", JSON.stringify(s), { mode: 0o600 });
}
const env = { ...process.env };
for (const k of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[k];
const docker = (...args) =>
  execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();
try {
  docker("network", "inspect", "healthkey-local");
} catch {
  docker("network", "create", "healthkey-local");
}
writeFileSync(
  ".local/postgres.env",
  `POSTGRES_PASSWORD=${s.db}\nPOSTGRES_DB=healthkey\n`,
  { mode: 0o600 },
);
try {
  docker("inspect", "healthkey-db");
} catch {
  docker(
    "run",
    "-d",
    "--name",
    "healthkey-db",
    "--network",
    "healthkey-local",
    "-p",
    "127.0.0.1:54322:5432",
    "--env-file",
    ".local/postgres.env",
    "-v",
    "healthkey-pg:/var/lib/postgresql/data",
    "postgres:17-alpine",
  );
}
docker("start", "healthkey-db");
let databaseReady = false;
for (let i = 0; i < 30; i++) {
  try {
    docker("exec", "healthkey-db", "pg_isready", "-U", "postgres");
    databaseReady = true;
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
if (!databaseReady) throw new Error("Local database is not ready.");
try {
  docker(
    "exec",
    "healthkey-db",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-c",
    "CREATE DATABASE healthkey_auth;",
  );
} catch {}
docker(
  "exec",
  "healthkey-db",
  "psql",
  "-U",
  "postgres",
  "-d",
  "healthkey_auth",
  "-c",
  "CREATE SCHEMA IF NOT EXISTS auth; ALTER DATABASE healthkey_auth SET search_path TO auth,public;",
);
writeFileSync(
  ".local/auth.env",
  `GOTRUE_API_HOST=0.0.0.0\nGOTRUE_API_PORT=9999\nAPI_EXTERNAL_URL=http://localhost:9999\nGOTRUE_SITE_URL=http://localhost:3000\nGOTRUE_DB_DRIVER=postgres\nGOTRUE_DB_DATABASE_URL=postgres://postgres:${s.db}@healthkey-db:5432/healthkey_auth?sslmode=disable\nGOTRUE_DB_NAMESPACE=auth\nGOTRUE_JWT_SECRET=${s.jwt}\nGOTRUE_JWT_EXP=1800\nGOTRUE_JWT_AUD=authenticated\nGOTRUE_JWT_ADMIN_ROLES=service_role\nGOTRUE_DISABLE_SIGNUP=true\nGOTRUE_EXTERNAL_EMAIL_ENABLED=true\nGOTRUE_MAILER_AUTOCONFIRM=true\nGOTRUE_MFA_ENABLED=true\nGOTRUE_MFA_TOTP_ENROLL_ENABLED=true\nGOTRUE_MFA_TOTP_VERIFY_ENABLED=true\n`,
  { mode: 0o600 },
);
try {
  docker("inspect", "healthkey-auth");
} catch {
  docker(
    "run",
    "-d",
    "--name",
    "healthkey-auth",
    "--network",
    "healthkey-local",
    "-p",
    "127.0.0.1:9999:9999",
    "--env-file",
    ".local/auth.env",
    "supabase/gotrue:v2.185.0",
  );
}
const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
  "base64url",
);
const payload = Buffer.from(
  JSON.stringify({
    role: "service_role",
    iss: "supabase",
    exp: Math.floor(Date.now() / 1000) + 86400 * 30,
  }),
).toString("base64url");
const input = `${head}.${payload}`;
const key = `${input}.${createHmac("sha256", s.jwt).update(input).digest("base64url")}`;
writeFileSync(
  ".env.local",
  `DATABASE_URL=postgresql://healthkey_app:${s.app}@127.0.0.1:54322/healthkey\nMAINTENANCE_DATABASE_URL=postgresql://healthkey_maintenance:${s.maintenance}@127.0.0.1:54322/healthkey\nMIGRATION_DATABASE_URL=postgresql://postgres:${s.db}@127.0.0.1:54322/healthkey\nAUTH_URL=http://127.0.0.1:9999\nAUTH_ADMIN_KEY=${key}\nAPP_BASE_URL=http://localhost:3000\nCRON_SECRET=${s.cron}\nDEMO_MODE=true\nREQUIRE_MFA=false\n`,
  { mode: 0o600 },
);
console.log(
  "Local PostgreSQL and Supabase Auth containers provisioned. Secrets saved in ignored local files.",
);
// Wait for actual auth readiness, not just container creation.
docker("start", "healthkey-auth");
let authReady = false;
for (let i = 0; i < 30; i++) {
  try {
    const r = await fetch("http://127.0.0.1:9999/health");
    if (r.ok) {
      authReady = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!authReady)
  throw new Error(
    "Local auth is not ready. Inspect the healthkey-auth container before setup.",
  );
