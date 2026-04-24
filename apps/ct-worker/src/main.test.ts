import { describe, expect, it } from "vitest";

import { createServer } from "./main.js";

describe("ct-worker bootstrap placeholder", () => {
  it("health endpoint returns ok", async () => {
    const server = createServer();
    const port = await new Promise<number>((resolve) => {
      server.listen(0, () => {
        resolve((server.address() as { port: number }).port);
      });
    });

    const res = await fetch(`http://localhost:${port}/health`);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("ct-worker");

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
