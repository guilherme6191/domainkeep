import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  pageHref,
  pageRange,
  parsePage,
  parsePageSize,
} from "@/lib/pagination";

describe("parsePage", () => {
  it("falls back to 1 for anything that is not a positive integer", () => {
    expect(parsePage("4")).toBe(4);
    expect([parsePage(null), parsePage("abc"), parsePage("0"), parsePage("-3"), parsePage("2.5")])
      .toEqual([1, 1, 1, 1, 1]);
  });
});

describe("parsePageSize", () => {
  it("accepts only the offered sizes", () => {
    expect([parsePageSize("40"), parsePageSize("80"), parsePageSize("120")]).toEqual([40, 80, 120]);
    expect([parsePageSize(null), parsePageSize("50"), parsePageSize("abc")])
      .toEqual([DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE]);
  });
});

describe("pageHref", () => {
  it("leaves the defaults out so page 1 at the default size stays canonical", () => {
    expect(pageHref(1, 40)).toBe("/domains");
    expect(pageHref(3, 40)).toBe("/domains?page=3");
    expect(pageHref(1, 80)).toBe("/domains?pageSize=80");
    expect(pageHref(3, 120)).toBe("/domains?page=3&pageSize=120");
  });
});

describe("pageRange", () => {
  it("lists every page up to seven", () => {
    expect(pageRange(1, 1)).toEqual([1]);
    expect(pageRange(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the ends and the current neighbourhood beyond seven", () => {
    expect(pageRange(1, 8)).toEqual([1, 2, "ellipsis", 8]);
    expect(pageRange(4, 8)).toEqual([1, "ellipsis", 3, 4, 5, "ellipsis", 8]);
    expect(pageRange(10, 20)).toEqual([1, "ellipsis", 9, 10, 11, "ellipsis", 20]);
    expect(pageRange(20, 20)).toEqual([1, "ellipsis", 19, 20]);
  });
});
