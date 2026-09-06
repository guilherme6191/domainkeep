import { describe, expect, it } from "vitest";
import { formatRelative } from "./format";

const NOW = new Date("2026-09-02T12:00:00Z");

/** Relative to NOW, in seconds. Negative is the past. */
function at(seconds: number): string {
  return new Date(NOW.getTime() + seconds * 1000).toISOString();
}

describe("formatRelative", () => {
  it("reads a fresh seven-day challenge as 'in 7 days', not 'in 6 days'", () => {
    expect(formatRelative(at(7 * 86400 - 5), NOW)).toBe("in 7 days");
  });

  it("rounds to the nearest unit instead of truncating", () => {
    expect(formatRelative(at(-(2 * 86400 + 20 * 3600)), NOW)).toBe("3 days ago");
    expect(formatRelative(at(-(59 * 60 + 40)), NOW)).toBe("1 hour ago");
  });
});
