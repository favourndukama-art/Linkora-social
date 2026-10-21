import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import Redis from "ioredis";
import { logger } from "./logger";

const CACHE_TTL_SECONDS = 30;
const CACHE_PREFIX = "search:";
const INVALIDATION_CHANNEL = "search_index_changed";

let redis: Redis | null = null;
let cacheLookups = 0;
let cacheHits = 0;
let invalidationInProgress: Promise<void> | null = null;

function getRedis(): Redis | null {
  const url = process.env["REDIS_URL"];
  if (!url) return null;
  if (!redis) {
    redis = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    redis.on("error", (err) => logger.warn({ err }, "search cache Redis unavailable"));
  }
  return redis;
}

export function createSearchCacheKey(query: string, type: string, cursor: string | number = ""): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([query.trim(), type, String(cursor)]))
    .digest("hex");
  return `${CACHE_PREFIX}${digest}`;
}

function logLookup(hit: boolean): void {
  cacheLookups += 1;
  if (hit) cacheHits += 1;
  if (cacheLookups >= 100) {
    logger.info(
      { lookups: cacheLookups, hits: cacheHits, hitRatio: Number((cacheHits / cacheLookups).toFixed(3)) },
      "search cache hit/miss ratio"
    );
    cacheLookups = 0;
    cacheHits = 0;
  }
}

/** Serve cached results when Redis is available and always fall back to PostgreSQL. */
export async function cachedSearch<T>(
  query: string,
  type: string,
  cursor: string | number,
  load: () => Promise<T>
): Promise<T> {
  const client = getRedis();
  if (!client) return load();

  const key = createSearchCacheKey(query, type, cursor);
  try {
    const cached = await client.get(key);
    if (cached !== null) {
      logLookup(true);
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    logger.warn({ err }, "search cache read failed; querying PostgreSQL");
  }
  logLookup(false);

  const result = await load();
  try {
    await client.set(key, JSON.stringify(result), "EX", CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err }, "search cache write failed");
  }
  return result;
}

/** Remove cached result pages after indexed content changes. */
export async function invalidateSearchCache(): Promise<void> {
  const client = getRedis();
  if (!client) return;
  if (invalidationInProgress) return invalidationInProgress;

  invalidationInProgress = (async () => {
    try {
      const stream = client.scanStream({ match: `${CACHE_PREFIX}*`, count: 100 });
      for await (const keys of stream) {
        if (keys.length > 0) await client.del(...keys);
      }
      logger.info("search cache invalidated after index update");
    } catch (err) {
      logger.warn({ err }, "search cache invalidation failed");
    }
  })().finally(() => {
    invalidationInProgress = null;
  });
  return invalidationInProgress;
}

/** Listen for PostgreSQL notifications emitted by the indexer cache trigger. */
export async function startSearchCacheInvalidationListener(pool: Pool): Promise<() => Promise<void>> {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query(`LISTEN ${INVALIDATION_CHANNEL}`);
    client.on("notification", (notification) => {
      if (notification.channel === INVALIDATION_CHANNEL) void invalidateSearchCache();
    });
  } catch (err) {
    client?.release();
    logger.warn({ err }, "search cache invalidation listener unavailable");
    return async () => undefined;
  }

  return async () => {
    try {
      await client!.query(`UNLISTEN ${INVALIDATION_CHANNEL}`);
    } finally {
      client!.release();
    }
  };
}

export async function closeSearchCache(): Promise<void> {
  if (!redis) return;
  const client = redis;
  redis = null;
  try {
    if (client.status === "wait") return;
    await client.quit();
  } catch (err) {
    logger.warn({ err }, "failed to close search cache Redis connection");
    client.disconnect();
  }
}
