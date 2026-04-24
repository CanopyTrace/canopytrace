import * as http from "node:http";

const PORT = Number(process.env["PORT"] ?? 3000);

export function createServer(): http.Server {
  return http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ct-web placeholder — Next.js UI wired in Phase 7\n");
  });
}

if (require.main === module) {
  createServer().listen(PORT);
}
