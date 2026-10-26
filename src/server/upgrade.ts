import { ensureCleanup } from "./maintenance";
import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { transaction } from "./db";
import { staff } from "./auth";
import { AppError, locales } from "@/lib/contracts";
import { assess, matchListings, type Listing } from "@/lib/matching";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const snapshotHash = (
  recipient: string,
  purpose: string,
  payload: unknown,
  expires: string,
) =>
  hash(
    JSON.stringify({
      recipient,
      purpose,
      payload: Object.fromEntries(
        Object.entries(payload as Record<string, unknown>).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      ),
      expires,
    }),
  );
const uuid = z.uuid();
const message = z
  .object({ message: z.string().trim().min(1).max(500), nonce: uuid })
  .strict();
const purpose = z.enum([
  "private_conversation",
  "health_support",
  "counselling",
  "legal_information",
  "unsure",
]);
const payload = z
  .object({
    category: purpose.optional(),
    communication_preference: z
      .enum(["spoken", "writing", "pictures", "sign", "support"])
      .optional(),
    requested_language: z.enum(locales).optional(),
    note: z.string().trim().min(1).max(240).optional(),
  })
  .strict();
const publicColumns =
  "id,clinic_id,public_name,categories,area,public_pathway,CASE WHEN protected_location THEN NULL ELSE public_address END public_address,protected_location,provider_languages,access_requirements,accessibility,costs,timezone,opens,closes,days,identity_checked_at,identity_source,details_confirmed_at,availability,availability_expires_at,monitored,pause_reason,version";
const ok = (v: unknown, status = 200) =>
  Response.json(v, { status, headers: { "Cache-Control": "no-store" } });
async function input(req: Request) {
  const text = await req.text();
  if (text.length > 32768) throw new AppError(413, "payload_too_large");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, "invalid_request");
  }
}
function fail(code = "access_denied", status = 403): never {
  throw new AppError(status, code);
}
async function holder<T>(
  req: Request,
  run: (c: PoolClient, cap: string) => Promise<T>,
) {
  const token = (await cookies()).get("hk_private")?.value;
  if (!token) fail("session_expired", 401);
  return transaction(null, async (c) => {
    await c.query("SELECT set_config('hk.view',$1,true)", [
      hash(req.headers.get("x-hk-view") ?? ""),
    ]);
    const cap = (
      await c.query("SELECT hk.resolve_holder($1) cap", [hash(token)])
    ).rows[0].cap;
    if (!cap) fail("session_expired", 401);
    await c.query("SELECT set_config('hk.holder',$1,true)", [cap]);
    return run(c, cap);
  });
}
async function listings(c: PoolClient) {
  return (
    await c.query<Listing>(
      `SELECT ${publicColumns} FROM hk.provider_listings WHERE public_approved ORDER BY public_name`,
    )
  ).rows;
}
async function audit(
  c: PoolClient,
  id: string,
  cid: string,
  actor: string | null,
  event: string,
  outcome?: string,
) {
  await c.query(
    "INSERT INTO hk.status_events(record_id,organisation_id,actor,event,outcome) VALUES($1,$2,$3,$4,$5)",
    [id, cid, actor, event, outcome ?? null],
  );
}
async function throttle(c: PoolClient, key: string, n = 30) {
  if (!(await c.query("SELECT hk.throttle($1,$2,60) ok", [key, n])).rows[0].ok)
    fail("rate_limited", 429);
}
function publicReferral(r: Record<string, unknown>, recipient = false) {
  return {
    id: r.id,
    state:
      r.expires_at && new Date(String(r.expires_at)) < new Date()
        ? "expired"
        : r.state,
    recipient: r.recipient,
    source: r.source,
    purpose: r.purpose,
    payload:
      r.expires_at && new Date(String(r.expires_at)) < new Date()
        ? {}
        : r.payload,
    snapshot_hash: r.snapshot_hash,
    version: r.version,
    snapshot_version: r.snapshot_version,
    expires_at: r.expires_at,
    sent_at: r.sent_at,
    acknowledged_at: r.acknowledged_at,
    outcome: r.outcome,
    responsible_role: "clinician",
    ...(recipient
      ? {}
      : {
          source_request_id: r.source_request_id,
          responsible_staff: r.responsible_staff,
        }),
  };
}
async function referrals(c: PoolClient, recipient = false) {
  const rows = (
    await c.query(
      "SELECT r.*,p.public_name recipient,c.name source FROM hk.referrals r JOIN hk.provider_listings p ON p.id=r.target_listing_id JOIN hk.clinics c ON c.id=r.source_clinic_id ORDER BY r.created_at DESC",
    )
  ).rows;
  const closed = (
    await c.query(
      "SELECT o.id,o.state,o.expires_at,o.outcome,o.responsible_staff,p.public_name recipient,c.name source FROM hk.referral_outcomes o JOIN hk.provider_listings p ON p.id=o.target_listing_id JOIN hk.clinics c ON c.id=o.source_clinic_id ORDER BY o.created_at DESC",
    )
  ).rows;
  return [
    ...rows.map((r) => publicReferral(r, recipient)),
    ...closed.map((r) => ({
      ...r,
      payload: {},
      purpose: "",
      snapshot_hash: "",
      snapshot_version: 0,
      version: 0,
      sent_at: null,
      acknowledged_at: null,
    })),
  ];
}
export async function upgrade(
  req: Request,
  path: string[],
): Promise<Response | null> {
  if (path[0] !== "v2") return null;
  await ensureCleanup();
  const p = path.slice(1),
    method = req.method;
  if (p[0] === "demo" && p[1] === "prepare" && method === "POST") {
    if (process.env.DEMO_MODE !== "true") fail("not_found", 404);
    z.object({})
      .strict()
      .parse(await input(req));
    return transaction(null, async (c) => {
      await throttle(c, "synthetic-demo-prepare", 30);
      const count = (await c.query("SELECT hk.prepare_demo() count")).rows[0]
        .count;
      if (count !== 2) fail("temporarily_unavailable", 503);
      return ok({
        demo: true,
        simulation: true,
        expires_in: 7200,
        listings: (await listings(c)).map((r) => assess(r)),
      });
    });
  }
  if (p[0] === "directory" && method === "GET")
    return transaction(null, async (c) => {
      const rows = await listings(c);
      return ok({
        demo: process.env.DEMO_MODE === "true",
        listings: rows.map((r) => assess(r)),
        ruleset: "directory-1",
        external_messaging: "disabled",
      });
    });
  if (p[0] === "match" && method === "POST") {
    const b = z
      .object({
        category: purpose.optional(),
        language: z.enum(locales).optional(),
        area: z.string().max(80).optional(),
        accessible: z.boolean().optional(),
      })
      .strict()
      .parse(await input(req));
    return transaction(null, async (c) =>
      ok({
        options: matchListings(await listings(c), b),
        ruleset: "directory-1",
      }),
    );
  }
  if (p[0] === "request" && method === "POST") {
    const b = z
      .object({
        clinic: z.string().regex(/^HK\d{3}$/),
        nonce: uuid,
        service_id: uuid.optional(),
        communication_pref: z
          .enum(["spoken", "writing", "pictures", "sign", "support"])
          .nullable(),
        language: z.enum(locales),
        kiosk: z.boolean().default(false),
      })
      .strict()
      .parse(await input(req));
    if (!process.env.CRON_SECRET) fail("temporarily_unavailable", 503);
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const key = [
      ...createHmac("sha256", process.env.CRON_SECRET!)
        .update("healthkey-access-v2:" + b.nonce)
        .digest(),
    ]
      .map((n) => alphabet[n & 31])
      .join("");
    const cap = createHash("sha256").update(key).digest("base64url");
    const value = await transaction(null, async (c) => {
      await throttle(c, "new:" + hash(b.nonce), 8);
      const clinic = (
        await c.query(
          "SELECT id,settings FROM hk.clinics WHERE code=$1 AND active",
          [b.clinic],
        )
      ).rows[0];
      if (!clinic) fail("clinic_unavailable", 404);
      const list = (await listings(c)).find((l) => l.clinic_id === clinic.id);
      if (
        !list ||
        assess(list).tier === "excluded" ||
        assess(list).available !== "accepting"
      )
        fail("provider_unavailable", 409);
      if (
        process.env.DEMO_MODE !== "true" &&
        !clinic.settings.translation_reviewed
      )
        fail("content_review_required", 503);
      const sid =
        b.service_id ??
        (
          await c.query(
            "SELECT id FROM hk.services WHERE clinic_id=$1 AND key='other_private' AND active",
            [clinic.id],
          )
        ).rows[0]?.id;
      if (!sid) fail("invalid_selection", 400);
      await c.query("SELECT hk.creation_contract($1,$2)", [
        hash(cap),
        hash(
          JSON.stringify({
            clinic: b.clinic,
            service: b.service_id ?? null,
            preference: b.communication_pref,
            language: b.language,
          }),
        ),
      ]);
      const result = (
        await c.query("SELECT hk.create_request($1,$2,$3,$4) result", [
          b.clinic,
          sid,
          b.communication_pref,
          hash(cap),
        ])
      ).rows[0].result;
      await c.query("SELECT hk.set_request_language($1,$2)", [
        hash(cap),
        b.language,
      ]);
      return result;
    });
    const session = randomBytes(32).toString("base64url");
    await transaction(null, (c) =>
      c.query("SELECT hk.exchange_holder($1,$2,$3,$4)", [
        hash(cap),
        hash(session),
        b.kiosk ? 120 : 1800,
        hash(req.headers.get("x-hk-view") ?? ""),
      ]),
    );
    (await cookies()).set("hk_private", session, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.APP_BASE_URL?.startsWith("https:"),
      path: "/api/v2",
      maxAge: b.kiosk ? 120 : 1800,
    });
    return ok({ ...value, private_code: key.match(/.{1,8}/g)!.join("-") }, 201);
  }
  if (p[0] === "session" && method === "POST") {
    const b = z
      .object({
        private_code: z.string().max(80),
        kiosk: z.boolean().default(false),
      })
      .strict()
      .parse(await input(req));
    const normalized = b.private_code.toUpperCase().replace(/[\s-]/g, "");
    const jar = await cookies();
    let abuse = jar.get("hk_entry")?.value;
    if (!abuse) {
      abuse = randomBytes(16).toString("hex");
      jar.set("hk_entry", abuse, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.APP_BASE_URL?.startsWith("https:"),
        path: "/api/v2",
        maxAge: 600,
      });
    }
    const cap = createHash("sha256").update(normalized).digest("base64url"),
      session = randomBytes(32).toString("base64url");
    const good = await transaction(null, async (c) => {
      await throttle(c, "entry:" + hash(abuse!), 12);
      if (
        !/^(?:[0-9A-HJKMNP-TV-Z]{32}|[0-9A-HJKMNP-TV-Z]{20})$/.test(normalized)
      )
        return false;
      return (
        await c.query("SELECT hk.exchange_holder($1,$2,$3,$4) ok", [
          hash(cap),
          hash(session),
          b.kiosk ? 120 : 1800,
          hash(req.headers.get("x-hk-view") ?? ""),
        ])
      ).rows[0].ok;
    });
    if (!good) fail("request_not_found", 404);
    jar.set("hk_private", session, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.APP_BASE_URL?.startsWith("https:"),
      path: "/api/v2",
      maxAge: b.kiosk ? 120 : 1800,
    });
    return ok({ ok: true });
  }
  if (p[0] === "clear" && method === "POST") {
    const jar = await cookies(),
      token = jar.get("hk_private")?.value;
    if (token)
      await transaction(null, (c) =>
        c.query("SELECT hk.resolve_holder($1,true)", [hash(token)]),
      );
    jar.delete({ name: "hk_private", path: "/api/v2" });
    return ok({ ok: true });
  }
  if (p[0] === "private")
    return holder(req, async (c, cap) => {
      if (p[1] === "renew" && method === "POST") {
        z.object({})
          .strict()
          .parse(await input(req));
        const jar = await cookies();
        const next = randomBytes(32).toString("base64url");
        const result = await c.query(
          "SELECT hk.exchange_holder($1,$2,120,$3) ok",
          [cap, hash(next), hash(req.headers.get("x-hk-view") ?? "")],
        );
        if (!result.rows[0].ok) fail("session_expired", 401);
        await c.query("SELECT hk.resolve_holder($1,true)", [
          hash(jar.get("hk_private")!.value),
        ]);
        jar.set("hk_private", next, {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.APP_BASE_URL?.startsWith("https:"),
          path: "/api/v2",
          maxAge: 120,
        });
        return ok({ ok: true });
      }
      if (p[1] === "room" && ["GET", "POST"].includes(method)) {
        const b =
          method === "POST" ? message.parse(await input(req)) : undefined;
        const r = (
          await c.query("SELECT hk.conversation(NULL,$1,NULL,$2,$3) result", [
            cap,
            b?.message ?? null,
            b?.nonce ?? null,
          ])
        ).rows[0].result;
        const pending = await referrals(c);
        if (!r && !pending.length) fail("request_not_found", 404);
        return ok({
          ...(r ?? {
            status: "request_closed",
            public_code: "",
            messages: [],
            organisation: "",
          }),
          referrals: pending,
        });
      }
      if (p[1] === "withdraw" && method === "POST") {
        await c.query("SELECT hk.withdraw_request($1)", [cap]);
        return ok({ ok: true });
      }
      if (p[1] === "referrals" && method === "GET")
        return ok(await referrals(c));
      if (p[1] === "referrals" && method === "POST") {
        const b = z
          .object({
            id: uuid,
            version: z.number().int(),
            hash: z.string().length(64),
            action: z.enum(["approve", "decline", "cancel"]),
          })
          .strict()
          .parse(await input(req));
        const r = (
          await c.query("SELECT * FROM hk.referrals WHERE id=$1 FOR UPDATE", [
            b.id,
          ])
        ).rows[0];
        if (!r || r.holder_digest !== cap) fail("not_found", 404);
        if (
          (r.version !== b.version && b.action !== "cancel") ||
          r.snapshot_hash !== b.hash
        )
          fail("referral_changed", 409);
        if (new Date(r.expires_at) <= new Date()) fail("expired", 410);
        if (b.action === "approve") {
          if (r.state !== "awaiting_consent") fail("invalid_transition", 409);
          await c.query(
            "INSERT INTO hk.consent_receipts(referral_id,snapshot_hash,recipient_id,approved_fields,expires_at) VALUES($1,$2,$3,$4,$5)",
            [
              r.id,
              r.snapshot_hash,
              r.target_clinic_id,
              Object.keys(r.payload),
              r.expires_at,
            ],
          );
        } else if (
          ["cancelled", "completed", "expired", "declined"].includes(r.state)
        )
          fail("invalid_transition", 409);
        const state = {
          approve: "approved",
          decline: "declined",
          cancel: "cancelled",
        }[b.action];
        if (b.action !== "approve")
          await c.query(
            "UPDATE hk.consent_receipts SET withdrawn_at=now() WHERE referral_id=$1 AND withdrawn_at IS NULL",
            [r.id],
          );
        await c.query(
          "UPDATE hk.referrals SET state=$2,version=version+1,terminal_at=CASE WHEN $2 IN('declined','cancelled') THEN now() ELSE NULL END WHERE id=$1",
          [r.id, state],
        );
        await audit(c, r.id, r.source_clinic_id, null, state);
        return ok({ ok: true });
      }
      fail("not_found", 404);
    });
  const s = await staff();
  if (p[0] === "preferences" && ["GET", "PUT"].includes(method))
    return transaction(s.id, async (c) => {
      if (method === "PUT") {
        const b = z
          .object({ language: z.enum(locales) })
          .strict()
          .parse(await input(req));
        await c.query(
          "INSERT INTO hk.interface_preferences VALUES($1,$2) ON CONFLICT(staff_id) DO UPDATE SET language=excluded.language",
          [s.id, b.language],
        );
      }
      return ok({
        language:
          (
            await c.query(
              "SELECT language FROM hk.interface_preferences WHERE staff_id=$1",
              [s.id],
            )
          ).rows[0]?.language ?? null,
      });
    });
  return transaction(s.id, async (c) => {
    if (p[0] === "queue" && method === "GET") {
      if (!["intake", "clinician"].includes(s.role)) fail();
      const rows = (
        await c.query(
          "SELECT r.id,r.public_code,r.status,r.assigned_to,r.version,r.created_at,r.expires_at,CASE WHEN $1='clinician' THEN r.communication_pref END communication_pref,CASE WHEN $1='clinician' THEN r.requested_language END requested_language FROM hk.requests_active r ORDER BY r.created_at",
          [s.role],
        )
      ).rows;
      const people = (
        await c.query(
          "SELECT id,name,role FROM hk.staff_users WHERE clinic_id=$1 AND active AND role='clinician'",
          [s.clinic_id],
        )
      ).rows;
      return ok({
        requests: rows,
        staff: people,
        referrals: s.role === "clinician" ? await referrals(c) : [],
      });
    }
    if (
      p[0] === "requests" &&
      p[2] === "messages" &&
      ["GET", "POST"].includes(method)
    ) {
      if (s.role !== "clinician") fail();
      const b = method === "POST" ? message.parse(await input(req)) : undefined;
      const result = (
        await c.query("SELECT hk.conversation(NULL,NULL,$1,$2,$3) result", [
          uuid.parse(p[1]),
          b?.message ?? null,
          b?.nonce ?? null,
        ])
      ).rows[0].result;
      if (!result) fail("not_found", 404);
      return ok(result);
    }
    if (p[0] === "requests" && method === "PATCH") {
      const b = z
        .object({
          action: z.enum(["acknowledge", "assign", "start", "complete"]),
          version: z.number().int(),
          assignee: uuid.optional(),
          outcome: z
            .enum(["support_provided", "handover_confirmed", "user_left"])
            .optional(),
        })
        .strict()
        .parse(await input(req));
      const r = (
        await c.query(
          "SELECT * FROM hk.requests_active WHERE id=$1 FOR UPDATE",
          [uuid.parse(p[1])],
        )
      ).rows[0];
      if (!r) fail("not_found", 404);
      if (r.version !== b.version) fail("request_changed", 409);
      if (b.action === "acknowledge") {
        if (r.status !== "new") fail("invalid_transition", 409);
        await c.query(
          "UPDATE hk.requests_active SET status='acknowledged',acknowledged_at=now(),expires_at=hard_expires_at,version=version+1 WHERE id=$1",
          [r.id],
        );
      } else if (b.action === "assign") {
        if (s.role !== "intake" || r.status === "new") fail();
        const target = (
          await c.query(
            "SELECT id FROM hk.staff_users WHERE id=$1 AND clinic_id=$2 AND active AND role='clinician'",
            [b.assignee, s.clinic_id],
          )
        ).rows[0];
        if (!target) fail("invalid_assignee", 400);
        await c.query(
          "UPDATE hk.requests_active SET assigned_to=$2,version=version+1 WHERE id=$1",
          [r.id, target.id],
        );
      } else {
        if (s.role !== "clinician" || r.assigned_to !== s.id) fail();
        if (b.action === "start") {
          if (r.status !== "acknowledged") fail("invalid_transition", 409);
          await c.query(
            "UPDATE hk.requests_active SET status='in_progress',version=version+1 WHERE id=$1",
            [r.id],
          );
        } else {
          if (!b.outcome || r.status !== "in_progress")
            fail("outcome_required", 400);
          await c.query("SELECT hk.finish_request($1,$2,$3)", [
            r.id,
            b.version,
            b.outcome,
          ]);
        }
      }
      await audit(c, r.id, r.clinic_id, s.id, b.action, b.outcome);
      return ok({ ok: true });
    }
    if (p[0] === "referrals" && method === "GET") return ok(await referrals(c));
    if (p[0] === "referrals" && method === "POST") {
      if (s.role !== "clinician") fail();
      const b = z
        .object({
          request_id: uuid,
          target_id: uuid,
          purpose,
          payload,
          nonce: uuid,
        })
        .strict()
        .parse(await input(req));
      await throttle(c, "referral:" + s.id);
      const r = (
        await c.query(
          "SELECT * FROM hk.requests_active WHERE id=$1 FOR UPDATE",
          [b.request_id],
        )
      ).rows[0];
      if (
        !r ||
        r.assigned_to !== s.id ||
        !["acknowledged", "in_progress"].includes(r.status)
      )
        fail("not_found", 404);
      const target = (await listings(c)).find((x) => x.id === b.target_id);
      if (
        !target ||
        target.clinic_id === s.clinic_id ||
        assess(target).tier === "excluded"
      )
        fail("provider_unavailable", 409);
      const existing = (
        await c.query("SELECT id FROM hk.referrals WHERE id=$1", [b.nonce])
      ).rows[0];
      if (existing) return ok(existing);
      const exp = new Date(Date.now() + 86400000).toISOString(),
        digest = snapshotHash(target.clinic_id, b.purpose, b.payload, exp);
      await c.query(
        "INSERT INTO hk.referrals(id,source_request_id,source_clinic_id,holder_digest,target_listing_id,target_clinic_id,responsible_staff,purpose,payload,snapshot_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          b.nonce,
          r.id,
          r.clinic_id,
          r.capability_hash,
          target.id,
          target.clinic_id,
          s.id,
          b.purpose,
          b.payload,
          digest,
          exp,
        ],
      );
      await c.query(
        "INSERT INTO hk.disclosure_snapshots(referral_id,version,recipient_id,content,content_hash) VALUES($1,1,$2,$3,$4)",
        [b.nonce, target.clinic_id, b.payload, digest],
      );
      await audit(c, b.nonce, r.clinic_id, s.id, "draft");
      return ok({ id: b.nonce }, 201);
    }
    if (p[0] === "referrals" && p[1] && method === "PATCH") {
      const b = z
        .object({
          version: z.number().int(),
          action: z.enum([
            "edit",
            "request_consent",
            "dispatch",
            "acknowledge",
            "decline",
            "cancel",
            "complete",
          ]),
          payload: payload.optional(),
          purpose: purpose.optional(),
          nonce: uuid.optional(),
          outcome: z
            .enum(["staff_confirmed_handover", "user_confirmed_receipt"])
            .optional(),
        })
        .strict()
        .parse(await input(req));
      const r = (
        await c.query("SELECT * FROM hk.referrals WHERE id=$1 FOR UPDATE", [
          uuid.parse(p[1]),
        ])
      ).rows[0];
      if (!r) fail("not_found", 404);
      if (s.role !== "clinician") fail();
      const source =
          r.source_clinic_id === s.clinic_id && r.responsible_staff === s.id,
        recipient = r.target_clinic_id === s.clinic_id;
      if (
        b.action === "dispatch" &&
        r.dispatch_key === b.nonce &&
        ["sent", "acknowledged", "completed"].includes(r.state)
      )
        return ok({ ok: true });
      if (r.version !== b.version) fail("referral_changed", 409);
      if (new Date(r.expires_at) <= new Date()) fail("expired", 410);
      let state = r.state;
      if (b.action === "edit") {
        if (!source || !b.payload) fail();
        const digest = snapshotHash(
          r.target_clinic_id,
          b.purpose ?? r.purpose,
          b.payload,
          new Date(r.expires_at).toISOString(),
        );
        await c.query(
          "UPDATE hk.referrals SET payload=$2,purpose=$3,snapshot_hash=$4,version=version+1 WHERE id=$1",
          [r.id, b.payload, b.purpose ?? r.purpose, digest],
        );
        const v = (
          await c.query(
            "SELECT snapshot_version FROM hk.referrals WHERE id=$1",
            [r.id],
          )
        ).rows[0].snapshot_version;
        await c.query(
          "INSERT INTO hk.disclosure_snapshots(referral_id,version,recipient_id,content,content_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
          [r.id, v, r.target_clinic_id, b.payload, digest],
        );
        await audit(c, r.id, s.clinic_id, s.id, "edited");
        return ok({ ok: true });
      }
      if (b.action === "request_consent") {
        if (!source || r.state !== "draft") fail("invalid_transition", 409);
        state = "awaiting_consent";
      }
      if (b.action === "dispatch") {
        if (!source || r.state !== "approved" || !b.nonce)
          fail("consent_required", 409);
        const listing = (
          await c.query<Listing>(
            `SELECT ${publicColumns} FROM hk.provider_listings WHERE id=$1`,
            [r.target_listing_id],
          )
        ).rows[0];
        if (
          !listing ||
          assess(listing).tier === "excluded" ||
          assess(listing).available !== "accepting"
        )
          fail("provider_unavailable", 409);
        state = "sent";
        await c.query(
          "UPDATE hk.referrals SET dispatch_key=$2,sent_at=now() WHERE id=$1",
          [r.id, b.nonce],
        );
      }
      if (b.action === "acknowledge") {
        if (!recipient || r.state !== "sent") fail();
        state = "acknowledged";
        await c.query(
          "UPDATE hk.referrals SET acknowledged_at=now(),acknowledged_by=$2 WHERE id=$1",
          [r.id, s.id],
        );
      }
      if (b.action === "decline") {
        if (!recipient || !["sent", "acknowledged"].includes(r.state)) fail();
        state = "declined";
      }
      if (b.action === "cancel") {
        if (!source || ["completed", "cancelled", "declined"].includes(r.state))
          fail();
        state = "cancelled";
        await c.query(
          "UPDATE hk.consent_receipts SET withdrawn_at=now() WHERE referral_id=$1",
          [r.id],
        );
      }
      if (b.action === "complete") {
        if (!recipient || r.state !== "acknowledged" || !b.outcome)
          fail("outcome_required", 400);
        state = "completed";
      }
      await c.query(
        "UPDATE hk.referrals SET state=$2,version=version+1,outcome=$3,terminal_at=CASE WHEN $2 IN('cancelled','declined','completed') THEN now() END WHERE id=$1",
        [r.id, state, b.outcome ?? null],
      );
      await audit(c, r.id, s.clinic_id, s.id, state, b.outcome);
      return ok({ ok: true });
    }
    if (p[0] === "providers") {
      if (method === "GET")
        return ok({
          listings: (
            await c.query<Listing>(
              `SELECT ${publicColumns} FROM hk.provider_listings WHERE clinic_id=$1 OR $2 OR ($3 AND public_approved) ORDER BY public_name`,
              [
                s.clinic_id,
                s.role === "verifier",
                ["intake", "clinician"].includes(s.role),
              ],
            )
          ).rows,
          reports:
            s.role === "verifier"
              ? (
                  await c.query(
                    "SELECT id,listing_id,reason,created_at,resolved_at FROM hk.listing_reports ORDER BY created_at DESC",
                  )
                ).rows
              : [],
        });
      if (p[1] === "report" && method === "POST") {
        const b = z
          .object({
            listing_id: uuid,
            reason: z.enum([
              "hours",
              "contact",
              "availability",
              "accessibility",
              "other",
            ]),
          })
          .strict()
          .parse(await input(req));
        await c.query(
          "INSERT INTO hk.listing_reports(listing_id,actor,reason) VALUES($1,$2,$3)",
          [b.listing_id, s.id, b.reason],
        );
        return ok({ ok: true });
      }
      if (s.role !== "admin" && s.role !== "verifier") fail();
      const id = uuid.parse(p[1]);
      if (p[2] === "checkin" && method === "POST") {
        if (s.role !== "admin") fail();
        const token = randomBytes(32).toString("base64url");
        await c.query(
          "INSERT INTO hk.provider_checkins(listing_id,actor,digest,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
          [id, s.id, hash(token)],
        );
        return ok({ token, expires_in: 600, simulation: true });
      }
      if (p[2] === "confirm" && method === "POST") {
        const b = z
          .object({
            token: z.string().min(30).max(100),
            version: z.number().int(),
          })
          .strict()
          .parse(await input(req));
        const token = (
          await c.query(
            "SELECT * FROM hk.provider_checkins WHERE listing_id=$1 AND digest=$2 AND used_at IS NULL AND expires_at>now() FOR UPDATE",
            [id, hash(b.token)],
          )
        ).rows[0];
        if (!token) fail("invalid_checkin", 404);
        const updated = await c.query(
          "UPDATE hk.provider_listings SET details_confirmed_at=now(),version=version+1 WHERE id=$1 AND version=$2",
          [id, b.version],
        );
        if (!updated.rowCount) fail("listing_changed", 409);
        await c.query(
          "UPDATE hk.provider_checkins SET used_at=now() WHERE id=$1",
          [token.id],
        );
        await audit(c, id, s.clinic_id, s.id, "details_confirmed");
        return ok({ ok: true });
      }
      if (method === "PATCH") {
        const b = z
          .object({
            version: z.number().int(),
            availability: z.enum([
              "accepting",
              "limited",
              "unavailable",
              "unknown",
            ]),
            monitored: z.boolean(),
            minutes: z.number().int().min(5).max(120),
            pause_reason: z.string().max(160),
            provider_languages: z.array(z.enum(locales)).max(5),
            access_requirements: z.enum(["adults", "unknown"]),
            accessibility: z.enum(["step_free", "unknown"]),
            costs: z.enum(["free", "unknown"]),
            opens: z.string().regex(/^\d{2}:\d{2}$/),
            closes: z.string().regex(/^\d{2}:\d{2}$/),
            timezone: z.enum(["Africa/Johannesburg", "Africa/Harare"]),
            days: z.array(z.number().int().min(0).max(6)).min(1),
            identity_confirm: z.boolean().optional(),
          })
          .strict()
          .parse(await input(req));
        if (b.availability === "accepting" && !b.monitored)
          fail("monitoring_required", 400);
        if (b.opens >= b.closes) fail("invalid_schedule", 400);
        const own = (
          await c.query(
            "SELECT clinic_id FROM hk.provider_listings WHERE id=$1",
            [id],
          )
        ).rows[0];
        if (!own || (s.role === "admin" && own.clinic_id !== s.clinic_id))
          fail();
        if (b.identity_confirm && s.role !== "verifier") fail();
        const result = await c.query(
          "UPDATE hk.provider_listings SET availability=$2,monitored=$3,availability_expires_at=now()+make_interval(mins=>$4),pause_reason=$5,provider_languages=$6,access_requirements=$7,accessibility=$8,costs=$9,opens=$10,closes=$11,timezone=$12,days=$13,identity_checked_at=CASE WHEN $14 THEN now() ELSE identity_checked_at END,identity_source=CASE WHEN $14 THEN 'synthetic_verifier_review' ELSE identity_source END,version=version+1 WHERE id=$1 AND version=$15",
          [
            id,
            b.availability,
            b.monitored,
            b.minutes,
            b.pause_reason,
            b.provider_languages,
            b.access_requirements,
            b.accessibility,
            b.costs,
            b.opens,
            b.closes,
            b.timezone,
            b.days,
            !!b.identity_confirm,
            b.version,
          ],
        );
        if (!result.rowCount) fail("listing_changed", 409);
        await audit(c, id, own.clinic_id, s.id, "listing_updated");
        return ok({ ok: true });
      }
    }
    fail("not_found", 404);
  });
}
