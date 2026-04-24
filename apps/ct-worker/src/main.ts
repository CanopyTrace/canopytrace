import * as http from "node:http";

const HEALTH_PORT = Number(process.env["HEALTH_PORT"] ?? 3002);

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", service: "ct-worker" }));
});

server.listen(HEALTH_PORT, "127.0.0.1", () => {
  console.log(`ct-worker placeholder: health on :${HEALTH_PORT}`);
  console.log("ct-worker: outbox poll loop — full implementation in Epic 3");
});
