import { Pool, type QueryResult, type QueryResultRow } from "pg";

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) throw new Error("DATABASE_URL must be configured for the search service");
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export async function query<R extends QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<R>> {
  const p = getDbPool();
  return p.query<R>(text, params as Parameters<Pool["query"]>[1]);
}

/** Named alias matching the export expected by app.ts and search.ts */
export const getPool = getDbPool;

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
