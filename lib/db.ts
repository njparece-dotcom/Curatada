import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

// Lazy-init the pg Pool so it only constructs on first query, not at module
// load. This matters for Next.js production builds: `next build` collects page
// data by importing every route module, which transitively imports this file.
// During the Railway build phase DATABASE_URL is unset, so eagerly calling
// `new Pool({ connectionString: undefined })` -> our throw -> build fails.
// At request time DATABASE_URL is always set, so deferring is safe.
function getPool(): Pool {
  if (globalThis._pgPool) return globalThis._pgPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // Hosted Postgres (Railway, Heroku, Render, RDS, ...) typically requires
  // TLS. Local dev against a docker-compose Postgres does not. Detect by
  // NODE_ENV; rejectUnauthorized:false matches what hosted vendors expect
  // (their certs aren't in Node's trust store).
  const ssl = process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined;

  const pool = new Pool({
    connectionString,
    ssl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Cache the pool on globalThis so getPool() returns the same instance
  // across all calls in the process — in dev this survives Next hot-reloads,
  // and in production it prevents a per-query Pool() leak. Without this,
  // every query allocates a new Pool that keeps idle connections alive for
  // 30s, and a burst of queries (e.g. an import) blows past Postgres's
  // max_connections with "sorry, too many clients already".
  globalThis._pgPool = pool;

  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
