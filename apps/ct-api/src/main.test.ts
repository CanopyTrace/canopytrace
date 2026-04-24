import { describe, expect, it } from "vitest";

import { placeholder } from "./main.js";

describe("ct-api bootstrap placeholder", () => {
  it("identifies the app", () => {
    expect(placeholder()).toBe("ct-api");
  });
});
