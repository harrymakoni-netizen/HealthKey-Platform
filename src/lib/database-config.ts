import type { PoolConfig } from "pg";

export function databaseConfig(
  connectionString: string | undefined,
  ca = process.env.DATABASE_CA_CERT,
): PoolConfig {
  if (!ca) return { connectionString };
  if (!connectionString)
    throw new Error("Database connection is not configured.");
  const url = new URL(connectionString);
  // pg parses URL SSL options after object options. Remove those overrides so
  // the trusted CA and hostname verification cannot be silently discarded.
  for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    url.searchParams.delete(key);
  }
  return {
    connectionString: url.toString(),
    ssl: { ca, rejectUnauthorized: true },
  };
}
