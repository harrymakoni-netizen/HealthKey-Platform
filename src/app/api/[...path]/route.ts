import { neonAuth } from "@/server/neon-auth";
import { upgrade } from "@/server/upgrade";
import { cookies } from "next/headers";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import { z, ZodError } from "zod";
import { transaction } from "@/server/db";
import { databaseConfig } from "@/lib/database-config";
import { authCall, staff, setSession, SESSION } from "@/server/auth";
import {
  AppError,
  requestSchema,
  settingsSchema,
  type Staff,
} from "@/lib/contracts";
export const dynamic = "force-dynamic";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const messageInput = z
  .object({
    message: z.string().trim().min(1).max(500),
    nonce: z.string().uuid(),
  })
  .strict();
async function conversation(
  actor: string | null,
  clinic: string | null,
  capability: string | null,
  id: string | null,
  body?: { message: string; nonce: string },
) {
  return transaction(actor, async (c) => {
    try {
      const r = await c.query("SELECT hk.conversation($1,$2,$3,$4,$5) result", [
        clinic,
        capability ? hash(capability) : null,
        id,
        body?.message ?? null,
        body?.nonce ?? null,
      ]);
      if (!r.rows[0].result) throw new AppError(404, "request_not_found");
      return r.rows[0].result;
    } catch (e) {
      if (
        e instanceof Error &&
        ["rate_limited", "conversation_full"].includes(e.message)
      )
        throw new AppError(429, e.message);
      if (e instanceof Error && e.message === "request_closed")
        throw new AppError(409, "request_closed");
      throw e;
    }
  });
}
const ok = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const labelSchema = z
  .object({
    en: z.string().trim().min(1).max(100),
    zu: z.string().trim().min(1).max(100),
    xh: z.string().trim().min(1).max(100),
    af: z.string().trim().min(1).max(100),
    nd: z.string().trim().min(1).max(100),
  })
  .strict();
const draftSchema = z
  .object({
    version: z.number().int(),
    settings: settingsSchema,
    services: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            active: z.boolean(),
            sort_order: z.number().int().min(0).max(100),
            labels: labelSchema,
            help: labelSchema,
            icon: z.enum([
              "heart",
              "flower",
              "baby",
              "sun",
              "shield",
              "leaf",
              "message",
              "lock",
              "hand",
            ]),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
async function json(req: Request) {
  const text = await req.text();
  if (text.length > 32_768) throw new AppError(413, "payload_too_large");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, "invalid_request");
  }
}
function admin(s: Staff) {
  if (s.role !== "admin") throw new AppError(403, "access_denied");
}
async function handle(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await context.params;
    const p = path.join("/");
    const method = req.method;
    if (method !== "GET" && p !== "internal/cleanup") {
      if (req.headers.get("origin") !== process.env.APP_BASE_URL)
        throw new AppError(403, "invalid_origin");
      if (!req.headers.get("content-type")?.startsWith("application/json"))
        throw new AppError(415, "json_required");
    }
    const upgraded = await upgrade(req, path);
    if (upgraded) return upgraded;
    if (p === "health" && method === "GET")
      return await transaction(null, async (c) => {
        const healthy = (await c.query("SELECT hk.healthy() ok")).rows[0].ok;
        return ok(
          { status: healthy ? "ready" : "degraded" },
          healthy ? 200 : 503,
        );
      });
    if (p === "internal/cleanup" && ["GET", "POST"].includes(method)) {
      const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`,
        got = req.headers.get("authorization") ?? "";
      if (
        !process.env.CRON_SECRET ||
        got.length !== expected.length ||
        !timingSafeEqual(Buffer.from(got), Buffer.from(expected))
      )
        throw new AppError(401, "access_denied");
      const pool = new Pool({
        ...databaseConfig(process.env.MAINTENANCE_DATABASE_URL),
        max: 1,
      });
      try {
        await pool.query("SELECT hk.cleanup()");
        return ok({ ok: true });
      } finally {
        await pool.end();
      }
    }
    if (p === "auth/login" && method === "POST") {
      const b = z
        .object({
          email: z.email().max(200),
          password: z.string().min(1).max(256),
        })
        .strict()
        .parse(await json(req));
      const permitted = await transaction(
        null,
        async (c) =>
          (
            await c.query("SELECT hk.throttle($1,8,300) allowed", [
              "login:" + hash(b.email.toLowerCase()),
            ])
          ).rows[0].allowed,
      );
      if (!permitted) throw new AppError(429, "rate_limited");
      if (process.env.AUTH_DATABASE_URL) {
        const signed = await neonAuth().api.signInEmail({ body: b });
        if (!signed.user) throw new AppError(401, "invalid_credentials");
        const member = await transaction(
          signed.user.id,
          async (c) =>
            (
              await c.query(
                "SELECT id FROM hk.staff_users WHERE id=$1 AND active",
                [signed.user.id],
              )
            ).rows[0],
        );
        if (!member) throw new AppError(403, "staff_access_required");
        return ok({ mfa: false, factors: [] });
      }
      const r = await authCall("/token?grant_type=password", {
        method: "POST",
        body: JSON.stringify(b),
      });
      if (!r.ok) throw new AppError(401, "invalid_credentials");
      const data = await r.json();
      await setSession(data.access_token);
      const user = await transaction(
        data.user.id,
        async (c) =>
          (
            await c.query(
              "SELECT * FROM hk.staff_users WHERE id=$1 AND active",
              [data.user.id],
            )
          ).rows[0],
      );
      if (!user) {
        (await cookies()).delete(SESSION);
        throw new AppError(403, "staff_access_required");
      }
      const factors =
        data.user.factors?.filter(
          (f: { status: string }) => f.status === "verified",
        ) ?? [];
      return ok({
        mfa: process.env.REQUIRE_MFA === "true",
        factors: factors.map((f: { id: string; friendly_name: string }) => ({
          id: f.id,
          name: f.friendly_name,
        })),
      });
    }
    if (p === "auth/logout" && method === "POST") {
      if (process.env.AUTH_DATABASE_URL) {
        await neonAuth().api.signOut({
          headers: await (await import("next/headers")).headers(),
        });
        return ok({ ok: true });
      }
      const token = (await cookies()).get(SESSION)?.value;
      if (token)
        await authCall("/logout", { method: "POST" }, token).catch(() => {});
      (await cookies()).delete(SESSION);
      return ok({ ok: true });
    }
    if (p === "auth/mfa/enroll" && method === "POST") {
      const token = (await cookies()).get(SESSION)?.value;
      if (!token) throw new AppError(401, "sign_in_required");
      const verified = await authCall("/user", {}, token);
      if (!verified.ok) throw new AppError(401, "sign_in_required");
      const u = await verified.json();
      const member = await transaction(
        u.id,
        async (c) =>
          (
            await c.query(
              "SELECT id FROM hk.staff_users WHERE id=$1 AND active",
              [u.id],
            )
          ).rowCount,
      );
      if (!member) throw new AppError(403, "staff_access_required");
      const r = await authCall(
        "/factors",
        {
          method: "POST",
          body: JSON.stringify({
            factor_type: "totp",
            friendly_name: "HealthKey authenticator",
            issuer: "HealthKey",
          }),
        },
        token,
      );
      if (!r.ok) throw new AppError(400, "mfa_enrollment_failed");
      const data = await r.json();
      return ok({
        id: data.id,
        secret: data.totp.secret,
        qr_code: data.totp.qr_code,
      });
    }
    if (p === "auth/mfa" && method === "POST") {
      const token = (await cookies()).get(SESSION)?.value;
      if (!token) throw new AppError(401, "sign_in_required");
      const b = z
        .object({
          factor: z.string().uuid(),
          code: z.string().regex(/^\d{6}$/),
        })
        .strict()
        .parse(await json(req));
      const challenge = await authCall(
        `/factors/${b.factor}/challenge`,
        { method: "POST", body: "{}" },
        token,
      );
      if (!challenge.ok) throw new AppError(400, "mfa_failed");
      const ch = await challenge.json();
      const verify = await authCall(
        `/factors/${b.factor}/verify`,
        {
          method: "POST",
          body: JSON.stringify({ challenge_id: ch.id, code: b.code }),
        },
        token,
      );
      if (!verify.ok) throw new AppError(400, "mfa_failed");
      await setSession((await verify.json()).access_token);
      return ok({ ok: true });
    }
    if (
      path[0] === "public" &&
      path[1] === "clinics" &&
      path[3] === "config" &&
      method === "GET"
    )
      return await transaction(null, async (c) => {
        const r = await c.query(
          "SELECT id,code,name,version,settings FROM hk.clinics WHERE code=$1 AND active",
          [path[2]],
        );
        if (!r.rows[0]) throw new AppError(404, "clinic_unavailable");
        const clinic = r.rows[0];
        if (
          process.env.DEMO_MODE !== "true" &&
          !clinic.settings.translation_reviewed
        )
          throw new AppError(503, "content_review_required");
        const services = (
          await c.query(
            "SELECT id,key,icon,active,sort_order,labels - 'sn' AS labels,help - 'sn' AS help FROM hk.services WHERE clinic_id=$1 AND active AND (key<>'urgent_private' OR $2) ORDER BY sort_order",
            [clinic.id, clinic.settings.urgent_enabled],
          )
        ).rows;
        return ok({
          ...clinic,
          demo: process.env.DEMO_MODE === "true",
          services,
        });
      });
    if (
      path[0] === "public" &&
      path[1] === "clinics" &&
      path[3] === "metrics" &&
      method === "POST"
    ) {
      const b = z
        .object({
          metric: z.enum(["language", "accessibility", "offline"]),
          value: z.enum([
            "en",
            "zu",
            "xh",
            "af",
            "nd",
            "large",
            "contrast",
            "simple",
            "display",
          ]),
        })
        .strict()
        .parse(await json(req));
      return await transaction(null, async (c) => {
        await c.query("SELECT hk.count_usage($1,$2,$3)", [
          path[2],
          b.metric,
          b.value,
        ]);
        return ok({ ok: true });
      });
    }
    if (
      path[0] === "public" &&
      path[1] === "clinics" &&
      path[3] === "requests" &&
      method === "POST"
    ) {
      const b = requestSchema.parse(await json(req));
      const jar = await cookies();
      let session = jar.get("hk_throttle")?.value;
      if (!session || !/^[a-f0-9]{32}$/.test(session)) {
        session = randomBytes(16).toString("hex");
        jar.set("hk_throttle", session, {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.APP_BASE_URL?.startsWith("https:"),
          maxAge: 600,
          path: "/api/public",
        });
      }
      return await transaction(null, async (c) => {
        const clinic = (
          await c.query(
            "SELECT settings FROM hk.clinics WHERE code=$1 AND active",
            [path[2]],
          )
        ).rows[0];
        if (!clinic) throw new AppError(404, "clinic_unavailable");
        if (
          b.communication_pref &&
          !clinic.settings.communication_options.includes(b.communication_pref)
        )
          throw new AppError(400, "invalid_preference");
        if (
          process.env.DEMO_MODE !== "true" &&
          !clinic.settings.translation_reviewed
        )
          throw new AppError(503, "content_review_required");
        const time = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Africa/Harare",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date());
        if (time < clinic.settings.open || time >= clinic.settings.close)
          throw new AppError(409, "clinic_closed");
        if (
          !(
            await c.query("SELECT hk.throttle($1,8,300) allowed", [
              "session:" + hash(session!),
            ])
          ).rows[0].allowed
        )
          throw new AppError(429, "rate_limited");
        const r = await c.query(
          "SELECT hk.create_request($1,$2,$3,$4) result",
          [path[2], b.service_id, b.communication_pref, hash(b.capability)],
        );
        return ok(r.rows[0].result, 201);
      });
    }
    if (path[0] === "public" && path[1] === "requests" && method === "POST") {
      const b = z
        .object({ capability: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
        .strict()
        .parse(await json(req));
      const cancel = path[3] === "cancel";
      if (!cancel && path[2] !== "resolve")
        throw new AppError(404, "not_found");
      return await transaction(null, async (c) => {
        const r = (
          await c.query("SELECT hk.public_request($1,$2) result", [
            hash(b.capability),
            cancel,
          ])
        ).rows[0].result;
        if (!r) throw new AppError(404, "request_not_found");
        return ok(r);
      });
    }
    if (
      path[0] === "public" &&
      path[1] === "clinics" &&
      path[3] === "conversation" &&
      method === "POST"
    ) {
      const b = z
        .object({
          capability: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
          message: messageInput.optional(),
        })
        .strict()
        .parse(await json(req));
      return ok(
        await conversation(null, path[2], b.capability, null, b.message),
      );
    }
    const s = await staff();
    if (
      path[0] === "staff" &&
      path[1] === "requests" &&
      path[3] === "messages" &&
      ["GET", "POST"].includes(method)
    ) {
      const id = z.string().uuid().parse(path[2]);
      const body =
        method === "POST" ? messageInput.parse(await json(req)) : undefined;
      return ok(await conversation(s.id, null, null, id, body));
    }
    if (p === "staff/me" && method === "GET") return ok(s);
    if (p === "staff/queue" && method === "GET")
      return (await upgrade(req, ["v2", "queue"]))!;
    if (
      path[0] === "staff" &&
      path[1] === "requests" &&
      path[2] &&
      method === "PATCH"
    )
      return (await upgrade(req, ["v2", "requests", path[2]]))!;
    if (p === "admin/config" && method === "GET") {
      admin(s);
      return await transaction(s.id, async (c) => {
        const clinic = (
          await c.query(
            "SELECT id,code,name,version,settings,draft FROM hk.clinics WHERE id=$1",
            [s.clinic_id],
          )
        ).rows[0];
        return ok({
          ...clinic,
          services: (
            await c.query(
              "SELECT id,key,icon,active,sort_order,labels,help FROM hk.services WHERE clinic_id=$1 ORDER BY sort_order",
              [s.clinic_id],
            )
          ).rows,
        });
      });
    }
    if (p === "admin/config/draft" && method === "PUT") {
      admin(s);
      const b = draftSchema.parse(await json(req));
      return await transaction(s.id, async (c) => {
        const current = (
          await c.query(
            "SELECT version FROM hk.clinics WHERE id=$1 FOR UPDATE",
            [s.clinic_id],
          )
        ).rows[0];
        if (current.version !== b.version)
          throw new AppError(409, "config_changed");
        const ids = (
          await c.query("SELECT id FROM hk.services WHERE clinic_id=$1", [
            s.clinic_id,
          ])
        ).rows.map((x) => x.id);
        if (
          ids.length !== b.services.length ||
          new Set(b.services.map((v) => v.id)).size !== ids.length ||
          b.services.some((v) => !ids.includes(v.id))
        )
          throw new AppError(400, "invalid_services");
        if (
          !b.settings.languages.includes("en") ||
          b.settings.open >= b.settings.close
        )
          throw new AppError(400, "invalid_settings");
        const saved = await c.query(
          "UPDATE hk.clinics SET draft=$2,draft_revision=gen_random_uuid() WHERE id=$1 RETURNING draft_revision",
          [s.clinic_id, b],
        );
        return ok({ ok: true, revision: saved.rows[0].draft_revision });
      });
    }
    if (p === "admin/config/publish" && method === "POST") {
      admin(s);
      const b = z
        .object({ version: z.number().int(), revision: z.string().uuid() })
        .strict()
        .parse(await json(req));
      return await transaction(s.id, async (c) => {
        const clinic = (
          await c.query("SELECT * FROM hk.clinics WHERE id=$1 FOR UPDATE", [
            s.clinic_id,
          ])
        ).rows[0];
        if (
          !clinic.draft ||
          clinic.version !== b.version ||
          clinic.draft_revision !== b.revision
        )
          throw new AppError(409, "config_changed");
        const draft = draftSchema.parse(clinic.draft);
        if (
          process.env.DEMO_MODE !== "true" &&
          !draft.settings.translation_reviewed
        )
          throw new AppError(409, "content_review_required");
        for (const v of draft.services)
          await c.query(
            "UPDATE hk.services SET active=$2,sort_order=$3,labels=labels || $4::jsonb,help=help || $5::jsonb,icon=$6 WHERE id=$1 AND clinic_id=$7",
            [
              v.id,
              v.active,
              v.sort_order,
              v.labels,
              v.help,
              v.icon,
              s.clinic_id,
            ],
          );
        await c.query(
          "INSERT INTO hk.config_versions(clinic_id,version,actor,configuration) VALUES($1,$2,$3,$4)",
          [s.clinic_id, clinic.version + 1, s.id, draft],
        );
        await c.query(
          "UPDATE hk.clinics SET settings=$2,name=$3,draft=NULL,draft_revision=NULL,version=version+1 WHERE id=$1",
          [s.clinic_id, draft.settings, draft.settings.name],
        );
        await c.query(
          "INSERT INTO hk.audit(clinic_id,actor,event,version) VALUES($1,$2,'config_published',$3)",
          [s.clinic_id, s.id, clinic.version + 1],
        );
        return ok({ ok: true });
      });
    }
    if (p === "admin/staff" && method === "GET") {
      admin(s);
      return await transaction(s.id, async (c) =>
        ok(
          (
            await c.query(
              "SELECT id,name,role,active,service_ids FROM hk.staff_users WHERE clinic_id=$1 AND role<>$2 ORDER BY name",
              [s.clinic_id, "platform"],
            )
          ).rows,
        ),
      );
    }
    if (
      path[0] === "admin" &&
      path[1] === "staff" &&
      path[2] &&
      method === "PATCH"
    ) {
      admin(s);
      const id = z.string().uuid().parse(path[2]),
        b = z
          .object({
            role: z.enum(["intake", "clinician", "admin"]),
            active: z.boolean(),
            service_ids: z.array(z.string().uuid()).max(20),
          })
          .strict()
          .parse(await json(req));
      if (id === s.id) throw new AppError(409, "cannot_change_self");
      return await transaction(s.id, async (c) => {
        const ids = (
          await c.query("SELECT id FROM hk.services WHERE clinic_id=$1", [
            s.clinic_id,
          ])
        ).rows.map((x) => x.id);
        if (b.service_ids.some((x) => !ids.includes(x)))
          throw new AppError(400, "invalid_services");
        const r = await c.query(
          "UPDATE hk.staff_users SET role=$2,active=$3,service_ids=$4 WHERE id=$1 AND clinic_id=$5 AND role NOT IN('platform','verifier')",
          [id, b.role, b.active, b.service_ids, s.clinic_id],
        );
        if (!r.rowCount) throw new AppError(404, "not_found");
        await c.query(
          "INSERT INTO hk.audit(clinic_id,actor,event) VALUES($1,$2,'staff_permissions_changed')",
          [s.clinic_id, s.id],
        );
        return ok({ ok: true });
      });
    }
    if (p === "admin/analytics" && method === "GET") {
      admin(s);
      const params = new URL(req.url).searchParams;
      const days = z.coerce
        .number()
        .int()
        .refine((x) => [7, 30, 90].includes(x))
        .parse(params.get("days") ?? 30);
      return await transaction(s.id, async (c) => {
        const rows = (
          await c.query(
            "SELECT a.service_id,s.labels->>'en' label,a.outcome,sum(a.count)::int count FROM hk.analytics_daily a JOIN hk.services s ON s.id=a.service_id WHERE a.clinic_id=$1 AND a.day>=((now() AT TIME ZONE 'Africa/Harare')::date-$2::int) AND a.day<(now() AT TIME ZONE 'Africa/Harare')::date GROUP BY a.service_id,s.labels,a.outcome",
            [s.clinic_id, days],
          )
        ).rows;
        // Release the whole fixed report only if every populated cell is at least 5. No complementary totals leak hidden cells.
        const small = (
          await c.query(
            "SELECT 1 FROM hk.analytics_daily WHERE clinic_id=$1 AND day>=((now() AT TIME ZONE 'Africa/Harare')::date-$2::int) AND day<(now() AT TIME ZONE 'Africa/Harare')::date AND count<5 LIMIT 1",
            [s.clinic_id, days],
          )
        ).rowCount;
        if (!rows.length || small || rows.some((r) => r.count < 5))
          return ok({ suppressed: true, rows: [], median_wait: null, days });
        const hist = (
          await c.query(
            "SELECT seconds,sum(count)::int n FROM hk.wait_histogram WHERE clinic_id=$1 AND day>=((now() AT TIME ZONE 'Africa/Harare')::date-$2::int) AND day<(now() AT TIME ZONE 'Africa/Harare')::date GROUP BY seconds ORDER BY seconds",
            [s.clinic_id, days],
          )
        ).rows;
        const total = hist.reduce((n, r) => n + r.n, 0);
        let n = 0,
          lo: number | null = null,
          hi: number | null = null;
        for (const r of hist) {
          n += r.n;
          if (lo === null && n >= Math.floor((total + 1) / 2)) lo = r.seconds;
          if (hi === null && n >= Math.ceil((total + 1) / 2)) hi = r.seconds;
        }
        return ok({
          suppressed: false,
          rows,
          median_wait:
            total >= 5 && lo !== null && hi !== null ? (lo + hi) / 2 : null,
          days,
        });
      });
    }
    if (p === "admin/audit" && method === "GET") {
      admin(s);
      return await transaction(s.id, async (c) =>
        ok(
          (
            await c.query(
              "SELECT event,version,created_at FROM hk.audit WHERE clinic_id=$1 ORDER BY created_at DESC LIMIT 50",
              [s.clinic_id],
            )
          ).rows,
        ),
      );
    }
    if (p === "admin/usage" && method === "GET") {
      admin(s);
      return await transaction(s.id, async (c) => {
        const rows = (
          await c.query(
            "SELECT metric,value,sum(count)::int count,min(count)::int minimum FROM hk.usage_daily WHERE clinic_id=$1 AND day<(now() AT TIME ZONE 'Africa/Harare')::date AND day>=(now() AT TIME ZONE 'Africa/Harare')::date-30 GROUP BY metric,value",
            [s.clinic_id],
          )
        ).rows;
        return ok({
          suppressed: !rows.length || rows.some((r) => r.minimum < 5),
          rows:
            rows.length && rows.every((r) => r.minimum >= 5)
              ? rows.map(({ metric, value, count }) => ({
                  metric,
                  value,
                  count,
                }))
              : [],
        });
      });
    }
    if (p === "platform/organizations" && method === "GET") {
      if (s.role !== "platform") throw new AppError(403, "access_denied");
      return await transaction(s.id, async (c) =>
        ok(
          (await c.query("SELECT id,name FROM hk.organizations ORDER BY name"))
            .rows,
        ),
      );
    }
    if (p === "platform/organizations" && method === "POST") {
      if (s.role !== "platform") throw new AppError(403, "access_denied");
      const b = z
        .object({ name: z.string().trim().min(3).max(100) })
        .strict()
        .parse(await json(req));
      return await transaction(s.id, async (c) =>
        ok(
          (
            await c.query(
              "INSERT INTO hk.organizations(name) VALUES($1) RETURNING id,name",
              [b.name],
            )
          ).rows[0],
          201,
        ),
      );
    }
    if (p === "platform/clinics" && method === "POST") {
      if (s.role !== "platform") throw new AppError(403, "access_denied");
      const b = z
        .object({
          name: z.string().trim().min(3).max(80),
          code: z.string().regex(/^[A-Z0-9_-]{3,20}$/),
          organization_id: z.string().uuid(),
        })
        .strict()
        .parse(await json(req));
      return await transaction(s.id, async (c) => {
        const template = (
          await c.query(
            "SELECT id,settings FROM hk.clinics ORDER BY code LIMIT 1",
          )
        ).rows[0];
        if (!template) throw new AppError(409, "template_required");
        const settings = {
          ...template.settings,
          name: b.name,
          translation_reviewed: false,
        };
        const created = (
          await c.query(
            "INSERT INTO hk.clinics(code,name,organization_id,settings,active) VALUES($1,$2,$3,$4,false) RETURNING id",
            [b.code, b.name, b.organization_id, settings],
          )
        ).rows[0];
        await c.query(
          "INSERT INTO hk.services(clinic_id,key,icon,active,sort_order,labels,help) SELECT $1,key,icon,active,sort_order,labels,help FROM hk.services WHERE clinic_id=$2",
          [created.id, template.id],
        );
        await c.query(
          "INSERT INTO hk.audit(clinic_id,actor,event) VALUES($1,$2,'clinic_created')",
          [created.id, s.id],
        );
        return ok({ id: created.id }, 201);
      });
    }
    if (p === "platform/clinics" && method === "GET") {
      if (s.role !== "platform") throw new AppError(403, "access_denied");
      return await transaction(s.id, async (c) =>
        ok(
          (
            await c.query(
              "SELECT id,code,name,active,version FROM hk.clinics ORDER BY name",
            )
          ).rows,
        ),
      );
    }
    if (path[0] === "platform" && path[1] === "clinics" && method === "PATCH") {
      if (s.role !== "platform") throw new AppError(403, "access_denied");
      const id = z.string().uuid().parse(path[2]),
        b = z
          .object({ active: z.boolean() })
          .strict()
          .parse(await json(req));
      return await transaction(s.id, async (c) => {
        await c.query("UPDATE hk.clinics SET active=$2 WHERE id=$1", [
          id,
          b.active,
        ]);
        await c.query(
          "INSERT INTO hk.audit(clinic_id,actor,event) VALUES($1,$2,'clinic_availability_changed')",
          [id, s.id],
        );
        return ok({ ok: true });
      });
    }
    throw new AppError(404, "not_found");
  } catch (e) {
    if (e instanceof ZodError) return ok({ error: "invalid_request" }, 400);
    if (e instanceof AppError) return ok({ error: e.code }, e.status);
    const known: Record<string, number> = {
      invalid_selection: 400,
      not_pending: 409,
      maintenance_unavailable: 503,
      rate_limited: 429,
      consent_required: 409,
      provider_unavailable: 409,
      conflicting_submission: 409,
      request_closed: 409,
      conversation_full: 429,
    };
    if (e instanceof Error && known[e.message])
      return ok({ error: e.message }, known[e.message]);
    // Do not log errors, query parameters or request bodies: database errors can contain selections.
    return ok({ error: "temporarily_unavailable" }, 503);
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as PUT };
