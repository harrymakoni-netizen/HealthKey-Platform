import { describe, expect, it } from "vitest";
import { databaseConfig } from "../src/lib/database-config";

describe("hosted database TLS", () => {
  it("preserves local connection behavior without a configured CA", () => {
    const local = "postgres://local@localhost/demo";
    expect(databaseConfig(local, "")).toEqual({ connectionString: local });
  });
  it("pins the configured CA and cannot be weakened by URL SSL flags", () => {
    const config = databaseConfig(
      "postgres://demo@database.example/demo?sslmode=no-verify&ssl=false&sslrootcert=wrong&application_name=healthkey",
      "trusted-ca",
    );
    expect(config.ssl).toEqual({ ca: "trusted-ca", rejectUnauthorized: true });
    const url = new URL(config.connectionString!);
    expect(url.searchParams.has("sslmode")).toBe(false);
    expect(url.searchParams.has("ssl")).toBe(false);
    expect(url.searchParams.has("sslrootcert")).toBe(false);
    expect(url.searchParams.get("application_name")).toBe("healthkey");
  });
});
