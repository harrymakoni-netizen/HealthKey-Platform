import { Pool } from "pg";
import { readFileSync, writeFileSync } from "node:fs";
if (
  process.env.DEMO_MODE !== "true" ||
  !new URL(process.env.MIGRATION_DATABASE_URL!).hostname.match(
    /^(127\.0\.0\.1|localhost)$/,
  )
)
  throw Error("Demo setup only runs against a local synthetic database.");
const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const secrets = JSON.parse(readFileSync(".local/secrets.json", "utf8"));
const existing = await pool.query("SELECT to_regclass('hk.clinics') AS t");
if (!existing.rows[0].t)
  await pool.query(readFileSync("database/001_schema.sql", "utf8"));
await pool.query(readFileSync("database/002_completion.sql", "utf8"));
if (!(await pool.query("SELECT to_regclass('hk.config_versions') t")).rows[0].t)
  await pool.query(readFileSync("database/003_configuration.sql", "utf8"));
await pool.query(`ALTER ROLE healthkey_app PASSWORD '${secrets.app}'`);
if (
  !(await pool.query("SELECT to_regprocedure('hk.cleanup_content()') t"))
    .rows[0].t
)
  await pool.query(readFileSync("database/006_health.sql", "utf8"));
await pool.query(readFileSync("database/007_maintenance.sql", "utf8"));
await pool.query(readFileSync("database/008_paused_admin.sql", "utf8"));
if (
  !(await pool.query("SELECT to_regclass('hk.request_messages') t")).rows[0].t
)
  await pool.query(readFileSync("database/009_conversations.sql", "utf8"));
for (const file of ["010_access_referrals.sql", "011_request_boundaries.sql"]) {
  if (
    file.startsWith("010") &&
    !(await pool.query("SELECT to_regclass('hk.referrals') t")).rows[0].t
  )
    await pool.query(readFileSync("database/" + file, "utf8"));
  if (
    file.startsWith("011") &&
    !(await pool.query("SELECT to_regclass('hk.creation_contracts') t")).rows[0]
      .t
  )
    await pool.query(
      readFileSync("database/" + file, "utf8").replaceAll(
        "CREATE FUNCTION",
        "CREATE OR REPLACE FUNCTION",
      ),
    );
}
if (
  !(await pool.query("SELECT to_regclass('hk.creation_contracts') t")).rows[0].t
)
  await pool.query(readFileSync("database/012_view_and_integrity.sql", "utf8"));
if (
  !(await pool.query("SELECT to_regprocedure('hk.cleanup_content()') t"))
    .rows[0].t
)
  await pool.query(readFileSync("database/013_hourly_retention.sql", "utf8"));
if (
  !(await pool.query("SELECT to_regclass('hk.referral_outcomes') t")).rows[0].t
)
  await pool.query(readFileSync("database/014_status_tombstones.sql", "utf8"));
if (
  !(await pool.query("SELECT to_regprocedure('hk.prepare_demo()') t")).rows[0].t
)
  await pool.query(readFileSync("database/015_demo_preparation.sql", "utf8"));
await pool.query(
  `ALTER ROLE healthkey_maintenance PASSWORD '${secrets.maintenance}'`,
);
const clinic = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
await pool.query(readFileSync("database/004_options.sql", "utf8"));
if (!(await pool.query("SELECT to_regclass('hk.organizations') t")).rows[0].t)
  await pool.query(readFileSync("database/005_operations.sql", "utf8"));
const settings = {
  communication_options: ["spoken", "writing", "pictures", "sign", "support"],
  name: "HealthKey Demo Clinic",
  languages: ["en", "nd", "zu", "xh", "af"],
  idle_seconds: 90,
  ttl_minutes: 60,
  urgent_enabled: true,
  open: "00:00",
  close: "23:59",
  after_hours: "Please ask clinic staff about local after-hours support.",
  translation_reviewed: false,
};
for (const [id, code, name] of [
  [clinic, "HK001", settings.name],
  [other, "HK002", "Second Demo Clinic"],
])
  await pool.query(
    "INSERT INTO hk.clinics(id,code,name,settings) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
    [id, code, name, { ...settings, name }],
  );
const services = [
  [
    "sexual_health",
    "heart",
    "Sexual health",
    "Hutano hwepabonde",
    "Impilo yezocansi",
    "STI, HIV and sexual health support",
    "Rubatsiro rweSTI, HIV nehutano hwepabonde",
    "Usizo lwe-STI, HIV lempilo yezocansi",
  ],
  [
    "family_planning",
    "flower",
    "Family planning",
    "Kuronga mhuri",
    "Ukuhlela imuli",
    "Contraception and family planning",
    "Kudzivirira pamuviri nekuronga mhuri",
    "Ukuvimbela ukukhulelwa lokuhlela imuli",
  ],
  [
    "pregnancy_support",
    "baby",
    "Pregnancy support",
    "Rubatsiro rwepamuviri",
    "Usizo lokukhulelwa",
    "Support before or during pregnancy",
    "Rubatsiro musati kana muri pamuviri",
    "Usizo ungakakhulelwa kumbe ukhulelwe",
  ],
  [
    "mental_health",
    "sun",
    "Emotional wellbeing",
    "Hutano hwepfungwa",
    "Impilo yengqondo",
    "Someone to talk to about how you feel",
    "Munhu wekutaura naye nezvamunonzwa",
    "Umuntu wokukhuluma laye ngokuzizwa kwakho",
  ],
  [
    "violence_support",
    "shield",
    "Safety & support",
    "Kuchengetedzeka nerubatsiro",
    "Ukuvikeleka losizo",
    "Private support with safety concerns",
    "Rubatsiro rwakavanzika pakuchengetedzeka",
    "Usizo oluyimfihlo ngokuvikeleka",
  ],
  [
    "substance_support",
    "leaf",
    "Substance-use support",
    "Rubatsiro rwezvinodhaka",
    "Usizo ngokusebenzisa izidakamizwa",
    "Non-judgmental support and counselling",
    "Rubatsiro nekurairwa pasina kutongwa",
    "Usizo lokwelulekwa ngaphandle kokwahlulelwa",
  ],
  [
    "communication_help",
    "message",
    "Communication assistance",
    "Rubatsiro rwekutaurirana",
    "Usizo lokukhulumisana",
    "Help to communicate your needs",
    "Rubatsiro rwekutaura zvamunoda",
    "Usizo lokutsho okudingayo",
  ],
  [
    "other_private",
    "lock",
    "Another private matter",
    "Imwe nyaya yakavanzika",
    "Enye indaba eyimfihlo",
    "Speak privately with a staff member",
    "Taurai nemushandi zvakavanzika",
    "Khuluma lomsebenzi ngasese",
  ],
  [
    "urgent_private",
    "hand",
    "I need private help now",
    "Ndinoda rubatsiro rwakavanzika izvozvi",
    "Ngidinga usizo oluyimfihlo khathesi",
    "Let staff know you need attention soon",
    "Udza vashandi kuti unoda rubatsiro nekukurumidza",
    "Yazisa abasebenzi ukuthi udinga usizo masinyane",
  ],
];
for (const cid of [clinic, other])
  for (const [i, s] of services.entries())
    await pool.query(
      "INSERT INTO hk.services(clinic_id,key,icon,sort_order,labels,help) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(clinic_id,key) DO NOTHING",
      [
        cid,
        s[0],
        s[1],
        i,
        { en: s[2], sn: s[3], nd: s[4] },
        { en: s[5], sn: s[6], nd: s[7] },
      ],
    );
const result = await fetch(process.env.AUTH_URL + "/admin/users", {
  headers: { Authorization: `Bearer ${process.env.AUTH_ADMIN_KEY}` },
});
if (!result.ok)
  throw Error("Auth service unavailable. Check local containers.");
const users = await result.json();
const accounts = [
  ["intake", "Intake staff", clinic],
  ["clinician", "Counsellor", clinic],
  ["admin", "Clinic administrator", clinic],
  ["other", "Other clinic intake", other],
  ["platform", "Platform operator", clinic],
  ["receiving", "Receiving practitioner", other],
  ["secondadmin", "Receiving provider administrator", other],
  ["verifier", "Directory verifier", clinic],
];
for (const [key, name, cid] of accounts) {
  const email = `${key}@healthkey.test`;
  let u = users.users.find((u: { email: string }) => u.email === email);
  if (!u) {
    const r = await fetch(process.env.AUTH_URL + "/admin/users", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AUTH_ADMIN_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password: secrets.password,
        email_confirm: true,
      }),
    });
    if (!r.ok) throw Error("Could not provision demo staff.");
    u = await r.json();
  }
  const ids = await pool.query(
    "SELECT id FROM hk.services WHERE clinic_id=$1 AND key='mental_health'",
    [cid],
  );
  await pool.query(
    "INSERT INTO hk.staff_users(id,clinic_id,name,role,service_ids) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
    [
      u.id,
      cid,
      name,
      key === "other"
        ? "intake"
        : key === "receiving"
          ? "clinician"
          : key === "secondadmin"
            ? "admin"
            : key,
      key === "clinician" ? [ids.rows[0].id] : [],
    ],
  );
}
const { seedUpgrade, seedRouting } = await import("./seed-upgrade.mjs");
await seedUpgrade(pool);
await seedRouting(pool);
await pool.query("SELECT hk.cleanup()");
await pool.end();
writeFileSync(
  ".local/DEMO-ACCESS.md",
  `# Local synthetic demo credentials\n\nThese work only with the provisioned local auth service.\n\nEmails: intake@healthkey.test, clinician@healthkey.test, admin@healthkey.test, other@healthkey.test, platform@healthkey.test\n\nPassword: ${secrets.password}\n\nPublic: http://localhost:3000/c/HK001\nStaff: http://localhost:3000/staff\n\nNever reuse these accounts or this password in production.\n`,
  { mode: 0o600 },
);
console.log(
  "Schema, two synthetic clinics and five staff roles ready. Local access details: .local/DEMO-ACCESS.md",
);
