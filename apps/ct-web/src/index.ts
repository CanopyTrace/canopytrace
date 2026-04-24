import * as http from "node:http";

const PORT = Number(process.env["PORT"] ?? 3000);

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ct-web placeholder — Next.js UI wired in Phase 7\n");
});

server.listen(PORT, () => {
  console.log(`ct-web placeholder listening on :${PORT}`);
});
