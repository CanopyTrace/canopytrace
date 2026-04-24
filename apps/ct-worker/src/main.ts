import * as http from "node:http";

const HEALTH_PORT = Number(process.env["HEALTH_PORT"] ?? 3002);

export function createServer(): http.Server {
  return http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "ct-worker" }));
  });
}

if (require.main === module) {
  createServer().listen(HEALTH_PORT, "127.0.0.1");
}
