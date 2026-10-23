import { neonAuth } from "./neon-auth";
import { cookies } from "next/headers";
import { AppError, type Staff } from "@/lib/contracts";
import { transaction } from "./db";
export const SESSION = "hk_staff";
export async function authCall(
  path: string,
  init: RequestInit = {},
  token?: string,
) {
  if (!process.env.AUTH_URL) throw new AppError(503, "auth_unavailable");
  return fetch(process.env.AUTH_URL + path, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.AUTH_API_KEY ? { apikey: process.env.AUTH_API_KEY } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}
export async function staff(): Promise<Staff> {
  if (process.env.AUTH_DATABASE_URL) {
    if (process.env.REQUIRE_MFA === "true")
      throw new AppError(403, "mfa_required");
    const session = await neonAuth().api.getSession({
      headers: await (await import("next/headers")).headers(),
    });
    if (!session?.user) throw new AppError(401, "sign_in_required");
    return membership(session.user.id);
  }
  const token = (await cookies()).get(SESSION)?.value;
  if (!token) throw new AppError(401, "sign_in_required");
  const response = await authCall("/user", {}, token);
  if (!response.ok) throw new AppError(401, "sign_in_required");
  const user = await response.json();
  // Decode only after provider validation. Never authorize an unverified JWT.
  const claims = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString(),
  );
  if (process.env.REQUIRE_MFA === "true" && claims.aal !== "aal2")
    throw new AppError(403, "mfa_required");
  return membership(user.id);
}
async function membership(id: string): Promise<Staff> {
  return transaction(id, async (c) => {
    const r = await c.query<Staff>(
      "SELECT s.*,c.name clinic_name,c.code clinic_code FROM hk.staff_users s LEFT JOIN hk.clinics c ON c.id=s.clinic_id WHERE s.id=$1 AND s.active AND (c.active OR s.role IN('admin','platform','verifier'))",
      [id],
    );
    if (!r.rows[0]) throw new AppError(403, "staff_access_required");
    return r.rows[0];
  });
}
export async function setSession(token: string) {
  (await cookies()).set(SESSION, token, {
    httpOnly: true,
    secure: process.env.APP_BASE_URL?.startsWith("https:") ?? false,
    sameSite: "strict",
    path: "/",
    maxAge: 1800,
  });
}
