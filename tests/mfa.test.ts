import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
process.loadEnvFile(".env.local");
function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=/g, ""))
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", Buffer.from(bytes))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, "0");
}
it("enrolls and verifies a real Supabase TOTP factor", async () => {
  const secrets = JSON.parse(readFileSync(".local/secrets.json", "utf8"));
  const post = async (path: string, body: unknown, cookie?: string) =>
    fetch("http://localhost:3000/api/" + path, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  const login = await post("auth/login", {
    email: "clinician@healthkey.test",
    password: secrets.password,
  });
  expect(login.status).toBe(200);
  let cookie = login.headers
    .getSetCookie()
    .find((s) => s.startsWith("hk_staff="))!
    .split(";")[0];
  const enrolled = await post("auth/mfa/enroll", {}, cookie);
  expect(enrolled.status).toBe(200);
  const factor = await enrolled.json();
  expect(factor.secret.length).toBeGreaterThan(12);
  const verified = await post(
    "auth/mfa",
    { factor: factor.id, code: totp(factor.secret) },
    cookie,
  );
  expect(verified.status).toBe(200);
  cookie = verified.headers
    .getSetCookie()
    .find((s) => s.startsWith("hk_staff="))!
    .split(";")[0];
  const token = cookie.slice(9);
  const claims = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString(),
  );
  expect(claims.aal).toBe("aal2");
  const cleanup = await fetch(process.env.AUTH_URL + "/factors/" + factor.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token },
  });
  expect(cleanup.ok).toBe(true);
});
