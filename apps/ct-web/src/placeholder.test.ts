import { describe, expect, it } from "vitest";

import { placeholder } from "./placeholder.js";

describe("ct-web bootstrap placeholder", () => {
  it("identifies the app", () => {
    expect(placeholder()).toBe("ct-web");
  });
});
