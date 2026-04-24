import * as http from "node:http";

import { logger } from "./logger";

const SERVICE = "ct-worker";
const HEALTH_PORT = Number(process.env["HEALTH_PORT"] ?? 3002);

function createHealthServer(): http.Server {
  return http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: SERVICE }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
}

async function bootstrap(): Promise<void> {
  logger.info("Worker starting", {
    service: SERVICE,
    env: process.env["NODE_ENV"] ?? "development",
  });

  const server = createHealthServer();
  await new Promise<void>((resolve) =>
    server.listen(HEALTH_PORT, "127.0.0.1", () => resolve()),
  );
  logger.info("Health server listening", { port: HEALTH_PORT });
  logger.info("Worker ready", { service: SERVICE });

  const shutdown = (): void => {
    logger.info("Worker shutting down", { service: SERVICE });
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

bootstrap().catch((err: unknown) => {
  logger.error("Worker failed to start", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
