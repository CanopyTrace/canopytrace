import { describe, expect, it } from "vitest";

import { placeholder } from "./main.js";

describe("ct-worker bootstrap placeholder", () => {
  it("identifies the app", () => {
    expect(placeholder()).toBe("ct-worker");
  });
});
