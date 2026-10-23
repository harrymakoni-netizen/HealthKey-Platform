import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";
import { databaseConfig } from "@/lib/database-config";
function create() {
  return betterAuth({
    baseURL: process.env.APP_BASE_URL,
    basePath: "/api/staff-identity",
    secret: process.env.NEON_AUTH_COOKIE_SECRET,
    database: new Pool({
      ...databaseConfig(process.env.AUTH_DATABASE_URL),
      options: "-c search_path=hk_auth,public",
      max: 3,
    }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    session: {
      expiresIn: 1800,
      updateAge: 300,
      cookieCache: { enabled: false },
    },
    advanced: {
      database: { generateId: "uuid" },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.APP_BASE_URL?.startsWith("https:"),
      },
    },
    rateLimit: { enabled: true, storage: "database" },
    logger: { disabled: true },
    plugins: [nextCookies()],
  });
}
let instance: ReturnType<typeof create>;
export function neonAuth() {
  return (instance ??= create());
}
