import * as http from "node:http";

const PORT = Number(process.env["PORT"] ?? 3001);

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", service: "ct-api" }));
});

server.listen(PORT, () => {
  console.log(`ct-api placeholder listening on :${PORT}`);
});
