import * as http from "node:http";

const PORT = Number(process.env["PORT"] ?? 3001);

export function createServer(): http.Server {
  return http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "ct-api" }));
  });
}

if (require.main === module) {
  createServer().listen(PORT);
}
