import "./tracing";
import { createApp } from "./app";
import { closeDbPool, getPool } from "./db";
import { closeSearchCache, startSearchCacheInvalidationListener } from "./cache";
import { logger } from "./logger";

const app = createApp();
const port = Number.parseInt(process.env["PORT"] ?? "3004", 10);
const host = process.env["HOST"] ?? "0.0.0.0";
const server = app.listen(port, host, () => logger.info({ port, host }, "search service listening"));

let shuttingDown = false;
const invalidationListener = startSearchCacheInvalidationListener(getPool());

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "search service shutdown started");

  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  let timeout: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("HTTP request drain timed out")), 10_000);
    timeout.unref();
  });

  try {
    await Promise.race([closed, timedOut]);
    if (timeout) clearTimeout(timeout);
    const stopInvalidationListener = await invalidationListener;
    await stopInvalidationListener();
    await Promise.all([closeDbPool(), closeSearchCache()]);
    logger.info({ signal }, "search service shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err, signal }, "search service shutdown timed out");
    await closeSearchCache();
    process.exit(1);
  }
}

process.on("SIGTERM", (signal) => void shutdown(signal));
process.on("SIGINT", (signal) => void shutdown(signal));

export { app };
