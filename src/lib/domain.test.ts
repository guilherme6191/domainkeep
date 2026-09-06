import { describe, expect, it } from "vitest";
import {
  normalizeDomain,
  verificationHostname,
  verificationRecordValue,
} from "@/lib/domain";

function normalized(input: string): string | null {
  const result = normalizeDomain(input);
  return result.ok ? result.domain : null;
}

describe("normalizeDomain", () => {
  it("lowercases, trims, and drops the root dot", () => {
    expect(normalized("  ExAmPle.COM.  ")).toBe("example.com");
  });

  it("keeps the exact subdomain the user asked for", () => {
    expect(normalized("news.recomendei.me")).toBe("news.recomendei.me");
  });

  it("converts internationalised names to ASCII", () => {
    expect(normalized("münchen.de")).toBe("xn--mnchen-3ya.de");
  });

  it("explains the URL prefix rather than silently stripping it", () => {
    const result = normalizeDomain("https://example.com");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("without the URL prefix");
  });

  it.each([
    ["example.com/path", "a path"],
    ["example.com:8080", "a port"],
    ["user@example.com", "an email address"],
    ["localhost", "a local name"],
    ["203.0.113.10", "an IPv4 address"],
    ["com", "a bare TLD"],
    ["co.uk", "a public suffix"],
    ["-bad.example.com", "a label starting with a hyphen"],
    ["", "an empty string"],
  ])("rejects %s (%s)", (input) => {
    expect(normalizeDomain(input).ok).toBe(false);
  });

  it("puts the record at the exact name claimed, never the parent", () => {
    expect(verificationHostname("news.recomendei.me")).toBe(
      "news.recomendei.me",
    );
    expect(verificationRecordValue("a".repeat(64))).toBe(
      `resend-verify=${"a".repeat(64)}`,
    );
  });
});
