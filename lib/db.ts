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

  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Reuse the pool across Next.js dev hot-reloads.
  if (process.env.NODE_ENV !== "production") {
    globalThis._pgPool = pool;
  }

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
