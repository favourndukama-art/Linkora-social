// tracing MUST be the very first import so OTel auto-instrumentations are
// registered before express (or any other library) is loaded.
import "./tracing";

import express, { type Application, Request, Response } from "express";
import { trace } from "@opentelemetry/api";
import { pino } from "pino";
import { Pool } from "pg";
import Redis from "ioredis";

const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  base: { service: "notification" },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(process.env["NODE_ENV"] !== "production" && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, ignore: "pid,hostname", translateTime: "SYS:standard" },
    },
  }),
});

const app: Application = express();
app.use(express.json());

let shuttingDown = false;
let inFlightRequests = 0;
let drainRequests: (() => void) | undefined;

app.use((req: Request, res: Response, next) => {
  if (shuttingDown) {
    res.setHeader("Connection", "close");
    res.status(503).json({ error: "service is shutting down" });
    return;
  }

  inFlightRequests += 1;
  let completed = false;
  const complete = () => {
    if (completed) return;
    completed = true;
    inFlightRequests -= 1;
    if (inFlightRequests === 0) drainRequests?.();
  };
  res.once("finish", complete);
  res.once("close", complete);
  next();
});

const tracer = trace.getTracer("notification");

/** GET /health — liveness probe with a sample manual span */
app.get("/health", (_req: Request, res: Response) => {
  const span = tracer.startSpan("notification.health.check");
  try {
    res.json({ status: "ok", service: "notification" });
  } finally {
    span.end();
  }
});

/** GET /health/ready — readiness probe */
app.get("/health/ready", (_req: Request, res: Response) => {
  res.json({ status: "ready", service: "notification" });
});

const PORT = parseInt(process.env["PORT"] ?? "3002", 10);
const database = process.env["DATABASE_URL"] ? new Pool({ connectionString: process.env["DATABASE_URL"] }) : undefined;
const redis = process.env["REDIS_URL"]
  ? new Redis(process.env["REDIS_URL"], { maxRetriesPerRequest: 1, retryStrategy: () => null })
  : undefined;

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, "notification service listening");
});

// Graceful shutdown
let shutdownPromise: Promise<void> | undefined;
function shutdown(signal: NodeJS.Signals): void {
  if (shutdownPromise) return;
  shuttingDown = true;
  logger.info({ signal, activeRequests: inFlightRequests }, "shutting down notification service");

  shutdownPromise = (async () => {
    const serverClosed = new Promise<void>((resolve) => server.close(() => resolve()));
    const requestsDrained = new Promise<void>((resolve) => {
      if (inFlightRequests === 0) resolve();
      else drainRequests = resolve;
    });
    let timeout: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("shutdown exceeded 10 seconds")), 10_000);
      timeout.unref();
    });

    try {
      await Promise.race([Promise.all([serverClosed, requestsDrained]), deadline]);
      if (timeout) clearTimeout(timeout);
      await Promise.all([database?.end(), redis?.quit()]);
      logger.info({ signal }, "notification service shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error({ err, signal }, "notification service shutdown timed out");
      redis?.disconnect();
      void database?.end().catch((closeErr) => logger.error({ err: closeErr }, "failed to close PostgreSQL pool"));
      process.exit(1);
    }
  })();
}

process.on("SIGTERM", (signal) => shutdown(signal));
process.on("SIGINT", (signal) => shutdown(signal));

export { app };
