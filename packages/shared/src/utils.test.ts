import { describe, expect, it } from "vitest";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../src/constants.js";
import {
  isNonEmptyString,
  isUuid,
  parsePaginationParams,
  buildPaginatedResult,
} from "../src/utils.js";

describe("parsePaginationParams", () => {
  it("returns defaults for missing values", () => {
    const result = parsePaginationParams(undefined, undefined);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("parses valid numeric strings", () => {
    const result = parsePaginationParams("3", "50");
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });

  it("clamps page to minimum of 1", () => {
    expect(parsePaginationParams(0, 10).page).toBe(1);
    expect(parsePaginationParams(-5, 10).page).toBe(1);
  });

  it("clamps pageSize to MAX_PAGE_SIZE", () => {
    expect(parsePaginationParams(1, 9999).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("clamps pageSize to minimum of 1", () => {
    expect(parsePaginationParams(1, 0).pageSize).toBe(1);
  });
});

describe("buildPaginatedResult", () => {
  it("computes totalPages correctly", () => {
    const result = buildPaginatedResult(["a", "b"], 10, { page: 1, pageSize: 2 });
    expect(result.totalPages).toBe(5);
    expect(result.total).toBe(10);
  });

  it("handles zero total", () => {
    const result = buildPaginatedResult([], 0, { page: 1, pageSize: 25 });
    expect(result.totalPages).toBe(0);
  });
});

describe("isNonEmptyString", () => {
  it("returns true for non-empty strings", () => {
    expect(isNonEmptyString("hello")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isNonEmptyString("")).toBe(false);
  });

  it("returns false for whitespace-only", () => {
    expect(isNonEmptyString("   ")).toBe(false);
  });

  it("returns false for non-string", () => {
    expect(isNonEmptyString(42)).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
  });
});

describe("isUuid", () => {
  it("validates a well-formed UUIDv4", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects malformed strings", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});
