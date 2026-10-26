import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { copy, translate, normalizeLocale } from "../src/i18n/copy";
import { assess, matchListings, type Listing } from "../src/lib/matching";
process.loadEnvFile(".env.local");
if (
  process.env.DEMO_MODE !== "true" ||
  !["127.0.0.1", "localhost"].includes(
    new URL(process.env.MIGRATION_DATABASE_URL!).hostname,
  )
)
  throw Error("Local synthetic database only");
const owner = new Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL,
});
const origin = "http://localhost:3000";
const secrets = JSON.parse(readFileSync(".local/secrets.json", "utf8"));
const sessions: Record<string, string> = {};
let sourceId: string, targetId: string, clinicianId: string;
async function call(
  path: string,
  body?: unknown,
  cookie?: string,
  method?: string,
) {
  return fetch(origin + "/api/" + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-HK-View": "test-view-secret-not-persisted-0123456789",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function login(role: string) {
  const r = await call("auth/login", {
    email: role + "@healthkey.test",
    password: secrets.password,
  });
  expect(r.status).toBe(200);
  return r.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
}
async function create() {
  const nonce = randomUUID();
  const input = {
    clinic: "HK001",
    nonce,
    communication_pref: "writing",
    language: "en",
  };
  const r = await call("v2/request", input);
  expect(r.status).toBe(201);
  const data = await r.json(),
    cookie = r.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; ");
  const id = (
    await owner.query(
      "SELECT id FROM hk.requests_active WHERE public_code=$1",
      [data.public_code],
    )
  ).rows[0].id;
  return { data, cookie, id, input };
}
async function assign(id: string) {
  await call(
    "v2/requests/" + id,
    { action: "acknowledge", version: 0 },
    sessions.intake,
    "PATCH",
  );
  const result = await call(
    "v2/requests/" + id,
    { action: "assign", version: 1, assignee: clinicianId },
    sessions.intake,
    "PATCH",
  );
  expect(result.status).toBe(200);
}
async function proposal(id: string) {
  const res = await call(
    "v2/referrals",
    {
      request_id: id,
      target_id: targetId,
      purpose: "counselling",
      payload: {
        communication_preference: "writing",
        requested_language: "en",
        note: "Synthetic approved note",
      },
      nonce: randomUUID(),
    },
    sessions.clinician,
  );
  expect(res.status).toBe(201);
  const rid = (await res.json()).id;
  let r = (await owner.query("SELECT * FROM hk.referrals WHERE id=$1", [rid]))
    .rows[0];
  expect(
    (
      await call(
        "v2/referrals/" + rid,
        { version: r.version, action: "request_consent" },
        sessions.clinician,
        "PATCH",
      )
    ).status,
  ).toBe(200);
  r = (await owner.query("SELECT * FROM hk.referrals WHERE id=$1", [rid]))
    .rows[0];
  return r;
}
async function approve(r: Record<string, unknown>, cookie: string) {
  expect(
    (
      await call(
        "v2/private/referrals",
        {
          id: r.id,
          version: r.version,
          hash: r.snapshot_hash,
          action: "approve",
        },
        cookie,
      )
    ).status,
  ).toBe(200);
  return (await owner.query("SELECT * FROM hk.referrals WHERE id=$1", [r.id]))
    .rows[0];
}
async function dispatch(r: Record<string, unknown>) {
  const b = { version: r.version, action: "dispatch", nonce: randomUUID() };
  const response = await call(
    "v2/referrals/" + r.id,
    b,
    sessions.clinician,
    "PATCH",
  );
  expect(response.status, JSON.stringify(await response.json())).toBe(200);
  return b;
}
beforeAll(async () => {
  await owner.query("SELECT hk.cleanup()");
  for (const role of [
    "intake",
    "clinician",
    "receiving",
    "admin",
    "secondadmin",
    "verifier",
    "other",
  ])
    sessions[role] = await login(role);
  const directory = await (await call("v2/directory")).json();
  sourceId = directory.listings.find((l: Listing) =>
    l.public_name.startsWith("Harbour"),
  ).id;
  targetId = directory.listings.find((l: Listing) =>
    l.public_name.startsWith("Bridge"),
  ).id;
  clinicianId = (
    await owner.query("SELECT id FROM hk.staff_users WHERE name='Counsellor'")
  ).rows[0].id;
  await owner.query(
    "UPDATE hk.provider_listings SET availability='accepting',availability_expires_at=now()+interval '2 hours',details_confirmed_at=now(),monitored=true WHERE id IN($1,$2)",
    [sourceId, targetId],
  );
}, 60000);
afterAll(async () => {
  await owner.query(
    "UPDATE hk.requests_active SET expires_at=now()-interval '1 second'",
  );
  await owner.query("SELECT hk.cleanup()");
  await owner.end();
});
describe("Language and deterministic matching", () => {
  it("explicit demo preparation recovers expired fictional providers without changing the stale example or requests", async () => {
    const before = (
      await owner.query(
        "SELECT availability_expires_at,details_confirmed_at FROM hk.provider_listings WHERE id='c3333333-3333-4333-8333-333333333333'",
      )
    ).rows[0];
    const requestCount = (
      await owner.query("SELECT count(*) n FROM hk.requests_active")
    ).rows[0].n;
    await owner.query(
      "UPDATE hk.provider_listings SET availability_expires_at=now()-interval '1 hour' WHERE id IN($1,$2)",
      [sourceId, targetId],
    );
    expect(
      (
        await call("v2/request", {
          clinic: "HK001",
          nonce: randomUUID(),
          communication_pref: "writing",
          language: "en",
        })
      ).status,
    ).toBe(409);
    const prepared = await call("v2/demo/prepare", {});
    expect(prepared.status).toBe(200);
    const data = await prepared.json();
    expect(data.simulation).toBe(true);
    expect(
      data.listings
        .filter((p: Listing & { available: string }) =>
          [sourceId, targetId].includes(p.id),
        )
        .every(
          (p: Listing & { available: string }) => p.available === "accepting",
        ),
    ).toBe(true);
    expect(
      (
        await owner.query(
          "SELECT availability_expires_at,details_confirmed_at FROM hk.provider_listings WHERE id='c3333333-3333-4333-8333-333333333333'",
        )
      ).rows[0],
    ).toEqual(before);
    expect(
      (await owner.query("SELECT count(*) n FROM hk.requests_active")).rows[0]
        .n,
    ).toBe(requestCount);
    await create();
  });
  it("covers every key in five languages and removes Shona", () => {
    expect(Object.keys(copy)).toEqual(["en", "nd", "zu", "xh", "af"]);
    for (const l of Object.keys(copy) as (keyof typeof copy)[]) {
      expect(Object.keys(copy[l]).sort()).toEqual(Object.keys(copy.en).sort());
      expect(Object.values(copy[l]).every((s) => s.trim())).toBe(true);
    }
    expect(normalizeLocale("sn")).toBe("en");
    expect(normalizeLocale("zu")).toBe("zu");
  });
  it("uses English fallback without inventing translations", () => {
    const original = copy.af.welcome;
    delete copy.af.welcome;
    expect(translate("af", "welcome")).toBe(copy.en.welcome);
    copy.af.welcome = original;
  });
  it("applies availability, freshness, schedule and language before confident claims", async () => {
    const rows = (await (await call("v2/directory")).json())
      .listings as Listing[];
    const now = new Date("2026-10-23T10:00:00Z");
    const p = {
      ...rows[0],
      days: [0, 1, 2, 3, 4, 5, 6],
      opens: "00:00",
      closes: "23:59",
      details_confirmed_at: now.toISOString(),
      availability_expires_at: "2026-10-23T12:00:00Z",
      identity_checked_at: now.toISOString(),
      monitored: true,
      availability: "accepting",
      provider_languages: ["en"],
    };
    expect(assess(p, now, { language: "en" }).tier).toBe("accepting");
    expect(assess({ ...p, availability: "unavailable" }, now).tier).toBe(
      "excluded",
    );
    expect(
      assess({ ...p, availability_expires_at: "2026-10-23T09:00:00Z" }, now)
        .available,
    ).toBe("unknown");
    expect(
      assess({ ...p, details_confirmed_at: "2026-10-01T00:00:00Z" }, now).tier,
    ).toBe("confirm");
    expect(assess(p, now, { language: "xh" }).questions).toContain(
      "language_unconfirmed",
    );
    expect(matchListings([p], { language: "en" }, now)).toEqual(
      matchListings([p], { language: "en" }, now),
    );
    expect(assess({ ...p, days: [] }, now).tier).toBe("excluded");
  });
});
describe("Private access, membership and messages", () => {
  it("creates one request on retries and separates private code from reception reference", async () => {
    const a = await create();
    expect(a.data.private_code.replaceAll("-", "")).toHaveLength(32);
    expect(a.data.public_code).toMatch(/^[A-F0-9]{6}$/);
    const retry = await (await call("v2/request", a.input)).json();
    expect(retry.public_code).toBe(a.data.public_code);
    expect(retry.private_code).toBe(a.data.private_code);
    expect(
      (await call("v2/session", { private_code: a.data.public_code })).status,
    ).toBe(404);
    expect((await call("v2/private/room")).status).toBe(401);
    const room = await (
      await call("v2/private/room", undefined, a.cookie)
    ).json();
    expect(room.status).toBe("submitted");
    expect(room.service_id).toBeUndefined();
  });
  it("denies identity/narrative fields and reception access to messages", async () => {
    const a = await create();
    expect(
      (await call("v2/request", { ...a.input, name: "Not allowed" })).status,
    ).toBe(400);
    expect(
      (
        await call(
          "v2/requests/" + a.id + "/messages",
          undefined,
          sessions.intake,
        )
      ).status,
    ).toBe(403);
    const q = await (await call("v2/queue", undefined, sessions.intake)).json();
    expect(q.requests.find((r: Item) => r.id === a.id)).not.toHaveProperty(
      "service_id",
    );
    expect(q.requests.find((r: Item) => r.id === a.id)).not.toHaveProperty(
      "capability_hash",
    );
  });
  it("enforces assigned practitioner, cross-request and organisation isolation", async () => {
    const a = await create(),
      b = await create();
    expect(
      (
        await call(
          "v2/requests/" + a.id + "/messages",
          undefined,
          sessions.clinician,
        )
      ).status,
    ).toBe(404);
    await assign(a.id);
    expect(
      (
        await call(
          "v2/requests/" + a.id + "/messages",
          undefined,
          sessions.receiving,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          "v2/requests/" + b.id + "/messages",
          undefined,
          sessions.clinician,
        )
      ).status,
    ).toBe(404);
    expect((await call("v2/queue", undefined, sessions.admin)).status).toBe(
      403,
    );
  });
  it("exchanges messages idempotently and closes with an explicit outcome", async () => {
    const a = await create();
    await assign(a.id);
    const body = { message: "Synthetic private message", nonce: randomUUID() };
    for (let i = 0; i < 2; i++)
      expect((await call("v2/private/room", body, a.cookie)).status).toBe(200);
    const room = await (
      await call(
        "v2/requests/" + a.id + "/messages",
        undefined,
        sessions.clinician,
      )
    ).json();
    expect(room.messages).toHaveLength(1);
    expect(
      (
        await call(
          "v2/requests/" + a.id + "/messages",
          { message: "Synthetic staff reply", nonce: randomUUID() },
          sessions.clinician,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          "v2/requests/" + a.id,
          { action: "start", version: 2 },
          sessions.clinician,
          "PATCH",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          "v2/requests/" + a.id,
          { action: "complete", version: 3 },
          sessions.clinician,
          "PATCH",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          "v2/requests/" + a.id,
          { action: "complete", version: 3, outcome: "support_provided" },
          sessions.clinician,
          "PATCH",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await owner.query(
          "SELECT count(*)::int n FROM hk.request_messages WHERE request_id=$1",
          [a.id],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("enforces expiry before cleanup and revokes removed staff during sessions", async () => {
    const a = await create();
    await assign(a.id);
    await owner.query("UPDATE hk.staff_users SET active=false WHERE id=$1", [
      clinicianId,
    ]);
    try {
      expect(
        (
          await call(
            "v2/requests/" + a.id + "/messages",
            undefined,
            sessions.clinician,
          )
        ).status,
      ).toBe(403);
    } finally {
      await owner.query("UPDATE hk.staff_users SET active=true WHERE id=$1", [
        clinicianId,
      ]);
    }
    await owner.query(
      "UPDATE hk.requests_active SET expires_at=now()-interval '1 second' WHERE id=$1",
      [a.id],
    );
    expect((await call("v2/private/room", undefined, a.cookie)).status).toBe(
      404,
    );
  });
  it("clears server sessions, preserves language preference separately and rejects wrong origins", async () => {
    const a = await create();
    expect((await call("v2/clear", {}, a.cookie)).status).toBe(200);
    expect((await call("v2/private/room", undefined, a.cookie)).status).toBe(
      401,
    );
    expect(
      (
        await fetch(origin + "/api/v2/session", {
          method: "POST",
          headers: {
            Origin: "https://elsewhere.test",
            "Content-Type": "application/json",
            "X-HK-View": "test-view-secret-not-persisted-0123456789",
          },
          body: JSON.stringify({ private_code: a.data.private_code }),
        })
      ).status,
    ).toBe(403);
  });
});
type Item = { id: string };
describe("View-bound session and concurrency", () => {
  it("explicit kiosk extension rotates the session and rejects the old cookie", async () => {
    const a = await create();
    const renewed = await call("v2/private/renew", {}, a.cookie);
    expect(renewed.status).toBe(200);
    const cookie = renewed.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; ");
    expect(cookie).not.toBe(a.cookie);
    expect(renewed.headers.getSetCookie().join(";")).toContain("Max-Age=120");
    expect((await call("v2/private/room", undefined, a.cookie)).status).toBe(
      401,
    );
    expect((await call("v2/private/room", undefined, cookie)).status).toBe(200);
  });
  it("rejects cookie-only reuse after the in-memory view has been destroyed", async () => {
    const a = await create();
    const r = await fetch(origin + "/api/v2/private/room", {
      headers: { Cookie: a.cookie },
    });
    expect(r.status).toBe(401);
  });
  it("rejects an idempotency key reused with a changed disclosure contract", async () => {
    const a = await create();
    expect(
      (await call("v2/request", { ...a.input, language: "af" })).status,
    ).toBe(409);
  });
  it("cancellation blocks a concurrent dispatch and leaves no subsequent recipient access", async () => {
    const a = await create();
    await assign(a.id);
    const r = await approve(await proposal(a.id), a.cookie);
    await Promise.all([
      call(
        "v2/private/referrals",
        {
          id: r.id,
          version: r.version,
          hash: r.snapshot_hash,
          action: "cancel",
        },
        a.cookie,
      ),
      call(
        "v2/referrals/" + r.id,
        { version: r.version, action: "dispatch", nonce: randomUUID() },
        sessions.clinician,
        "PATCH",
      ),
    ]);
    expect(
      (await owner.query("SELECT state FROM hk.referrals WHERE id=$1", [r.id]))
        .rows[0].state,
    ).toBe("cancelled");
    expect(
      (
        await (await call("v2/referrals", undefined, sessions.receiving)).json()
      ).some((x: Referral) => x.id === r.id),
    ).toBe(false);
  });
});
describe("Consent and cross-organisation handovers", () => {
  it("binds exact fields and recipient; recipients receive only approved snapshot", async () => {
    const a = await create();
    await assign(a.id);
    const r = await proposal(a.id);
    expect(
      (
        await call(
          "v2/referrals/" + r.id,
          { version: r.version, action: "dispatch", nonce: randomUUID() },
          sessions.clinician,
          "PATCH",
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          "v2/private/referrals",
          {
            id: r.id,
            version: r.version,
            hash: "0".repeat(64),
            action: "approve",
          },
          a.cookie,
        )
      ).status,
    ).toBe(409);
    const approved = await approve(r, a.cookie);
    expect(
      (
        await owner.query(
          "SELECT * FROM hk.consent_receipts WHERE referral_id=$1",
          [r.id],
        )
      ).rows[0],
    ).not.toHaveProperty("holder_digest");
    await dispatch(approved);
    const rows = await (
      await call("v2/referrals", undefined, sessions.receiving)
    ).json();
    const received = rows.find((x: Referral) => x.id === r.id);
    expect(received.payload).toEqual(r.payload);
    expect(received).not.toHaveProperty("holder_digest");
    expect(received).not.toHaveProperty("messages");
    expect(
      (
        await call(
          "v2/requests/" + a.id + "/messages",
          undefined,
          sessions.receiving,
        )
      ).status,
    ).toBe(404);
  });
  it("invalidates consent when disclosure changes and rejects recipient mutation at the DB", async () => {
    const a = await create();
    await assign(a.id);
    const r = await approve(await proposal(a.id), a.cookie);
    expect(
      (
        await call(
          "v2/referrals/" + r.id,
          {
            version: r.version,
            action: "edit",
            payload: { note: "Changed synthetic note" },
          },
          sessions.clinician,
          "PATCH",
        )
      ).status,
    ).toBe(200);
    const changed = (
      await owner.query("SELECT * FROM hk.referrals WHERE id=$1", [r.id])
    ).rows[0];
    expect(changed.state).toBe("draft");
    expect(
      (
        await call(
          "v2/referrals/" + r.id,
          { version: changed.version, action: "dispatch", nonce: randomUUID() },
          sessions.clinician,
          "PATCH",
        )
      ).status,
    ).toBe(409);
    await expect(
      owner.query(
        "UPDATE hk.referrals SET target_clinic_id=source_clinic_id WHERE id=$1",
        [r.id],
      ),
    ).rejects.toThrow("new_referral_required");
  });
  it("cancels before dispatch and blocks future recipient access after cancellation", async () => {
    const a = await create();
    await assign(a.id);
    let r = await approve(await proposal(a.id), a.cookie);
    await dispatch(r);
    r = (await owner.query("SELECT * FROM hk.referrals WHERE id=$1", [r.id]))
      .rows[0];
    expect(
      (
        await call(
          "v2/private/referrals",
          {
            id: r.id,
            version: r.version,
            hash: r.snapshot_hash,
            action: "cancel",
          },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await (await call("v2/referrals", undefined, sessions.receiving)).json()
      ).some((x: Referral) => x.id === r.id),
    ).toBe(false);
    expect(
      (
        await call(
          "v2/referrals/" + r.id,
          { version: r.version, action: "acknowledge" },
          sessions.receiving,
          "PATCH",
        )
      ).status,
    ).toBe(404);
  });
  it("records acknowledgement and staff-confirmed handover separately", async () => {
    const a = await create();
    await assign(a.id);
    let r = await approve(await proposal(a.id), a.cookie);
    const b = await dispatch(r);
    expect(
      (await call("v2/referrals/" + r.id, b, sessions.clinician, "PATCH"))
        .status,
    ).toBe(200);
    r = (await owner.query("SELECT * FROM hk.referrals WHERE id=$1", [r.id]))
      .rows[0];
    expect(
      (
        await call(
          "v2/referrals/" + r.id,
          { version: r.version, action: "acknowledge" },
          sessions.receiving,
          "PATCH",
        )
      ).status,
    ).toBe(200);
    r = (await owner.query("SELECT * FROM hk.referrals WHERE id=$1", [r.id]))
      .rows[0];
    expect(r.acknowledged_by).toBeTruthy();
    expect(
      (
        await call(
          "v2/referrals/" + r.id,
          {
            version: r.version,
            action: "complete",
            outcome: "staff_confirmed_handover",
          },
          sessions.receiving,
          "PATCH",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await owner.query("SELECT outcome FROM hk.referrals WHERE id=$1", [
          r.id,
        ])
      ).rows[0].outcome,
    ).toBe("staff_confirmed_handover");
  });
  it("decline preserves support and expiration purges disclosure content", async () => {
    const a = await create();
    await assign(a.id);
    const r = await proposal(a.id);
    expect(
      (
        await call(
          "v2/private/referrals",
          {
            id: r.id,
            version: r.version,
            hash: r.snapshot_hash,
            action: "decline",
          },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    expect((await call("v2/private/room", undefined, a.cookie)).status).toBe(
      200,
    );
    await owner.query(
      "UPDATE hk.referrals SET expires_at=now()-interval '1 second' WHERE id=$1",
      [r.id],
    );
    await owner.query("SELECT hk.cleanup()");
    expect(
      (
        await owner.query(
          "SELECT count(*)::int n FROM hk.disclosure_snapshots WHERE referral_id=$1",
          [r.id],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("rejects dispatch to a newly unavailable provider without changing recipient", async () => {
    const a = await create();
    await assign(a.id);
    const r = await approve(await proposal(a.id), a.cookie);
    await owner.query(
      "UPDATE hk.provider_listings SET availability='unavailable' WHERE id=$1",
      [targetId],
    );
    try {
      expect(
        (
          await call(
            "v2/referrals/" + r.id,
            { version: r.version, action: "dispatch", nonce: randomUUID() },
            sessions.clinician,
            "PATCH",
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await owner.query("SELECT state FROM hk.referrals WHERE id=$1", [
            r.id,
          ])
        ).rows[0].state,
      ).toBe("approved");
    } finally {
      await owner.query(
        "UPDATE hk.provider_listings SET availability='accepting' WHERE id=$1",
        [targetId],
      );
    }
  });
});
type Referral = { id: string; payload: unknown };
describe("Directory integrity and operational controls", () => {
  it("keeps protected locations out of public responses and unknown availability honest", async () => {
    const rows = await (await call("v2/directory")).json();
    expect(
      rows.listings.find((x: Listing) => x.protected_location).public_address,
    ).toBeNull();
    await expect(
      owner.query(
        "UPDATE hk.provider_listings SET public_address='Protected synthetic location' WHERE protected_location",
      ),
    ).rejects.toThrow();
  });
  it("scopes expiring one-use check-ins to the correct provider admin", async () => {
    const r = await call(
      "v2/providers/" + sourceId + "/checkin",
      {},
      sessions.admin,
    );
    expect(r.status).toBe(200);
    const { token } = await r.json();
    expect(
      (
        await call(
          "v2/providers/" + sourceId + "/confirm",
          { token, version: 0 },
          sessions.secondadmin,
        )
      ).status,
    ).toBe(404);
    const version = (
      await owner.query(
        "SELECT version FROM hk.provider_listings WHERE id=$1",
        [sourceId],
      )
    ).rows[0].version;
    expect(
      (
        await call(
          "v2/providers/" + sourceId + "/confirm",
          { token, version },
          sessions.admin,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          "v2/providers/" + sourceId + "/confirm",
          { token, version: version + 1 },
          sessions.admin,
        )
      ).status,
    ).toBe(404);
  });
  it("denies reception/private directory edits and verifies scrubbed audit metadata", async () => {
    expect(
      (
        await call(
          "v2/providers/" + sourceId,
          { availability: "accepting" },
          sessions.intake,
          "PATCH",
        )
      ).status,
    ).toBe(403);
    const events = (await owner.query("SELECT * FROM hk.status_events")).rows;
    expect(JSON.stringify(events)).not.toContain("Synthetic approved note");
    expect(JSON.stringify(events)).not.toContain(secrets.password);
  });
});
