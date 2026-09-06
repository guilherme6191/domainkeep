import { VERIFICATION_VALUE_PREFIX } from "@/lib/types";

export type NormalizationResult =
  | { ok: true; domain: string }
  | { ok: false; message: string };

// A pragmatic subset of the Public Suffix List: enough to reject obvious
// mistakes without a dependency that needs updating.
const PUBLIC_SUFFIXES = new Set([
  "co.uk", "org.uk", "me.uk", "gov.uk", "ac.uk",
  "com.br", "net.br", "org.br", "com.au", "net.au", "org.au",
  "co.jp", "or.jp", "ne.jp", "co.nz", "co.za", "com.mx", "com.ar",
  "co.in", "com.cn", "com.sg", "com.tr", "com.pl", "com.es",
  "github.io", "vercel.app", "netlify.app", "herokuapp.com", "pages.dev",
]);

const RESERVED_TLDS = new Set([
  "local", "localhost", "internal", "test", "invalid", "example", "home", "lan",
]);

const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Canonical ASCII form. Shared by the browser (early feedback) and the server
 * (authoritative decision). IDNA is delegated to `URL`.
 */
export function normalizeDomain(input: string): NormalizationResult {
  const trimmed = input.trim();

  if (!trimmed) {
    return { ok: false, message: "Enter a domain to verify." };
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return {
      ok: false,
      message:
        "Please enter the domain without the URL prefix (e.g., example.com instead of https://example.com).",
    };
  }

  if (trimmed.includes("@")) {
    return {
      ok: false,
      message: "Enter a domain, not an email address (e.g., example.com).",
    };
  }

  if (/[\s/?#]/.test(trimmed)) {
    return {
      ok: false,
      message: "Enter the domain on its own, without a path or query string.",
    };
  }

  if (trimmed.includes(":")) {
    return { ok: false, message: "Enter the domain without a port number." };
  }

  // A single trailing dot is the valid absolute form; drop it.
  const withoutRootDot = trimmed.replace(/\.$/, "");

  let hostname: string;
  try {
    hostname = new URL(`http://${withoutRootDot}`).hostname;
  } catch {
    return { ok: false, message: "That doesn't look like a valid domain." };
  }

  if (hostname.startsWith("[")) {
    return { ok: false, message: "Enter a domain name, not an IP address." };
  }
  if (IPV4.test(hostname)) {
    return { ok: false, message: "Enter a domain name, not an IP address." };
  }

  const domain = hostname.toLowerCase();

  if (domain.length > 253) {
    return { ok: false, message: "That domain is too long to be valid." };
  }

  const labels = domain.split(".");

  if (labels.length < 2) {
    return {
      ok: false,
      message: "Enter a full domain, including its extension (e.g., example.com).",
    };
  }

  for (const label of labels) {
    if (label.length === 0 || label.length > 63 || !LABEL.test(label)) {
      return { ok: false, message: "That doesn't look like a valid domain." };
    }
  }

  const tld = labels[labels.length - 1];
  if (RESERVED_TLDS.has(tld)) {
    return {
      ok: false,
      message: "That domain can't be reached on the public internet.",
    };
  }

  if (PUBLIC_SUFFIXES.has(domain)) {
    return {
      ok: false,
      message: "That's a public suffix, not a domain you can control on your own.",
    };
  }

  return { ok: true, domain };
}

/**
 * The record lives at the claimed name itself, so this is the domain. It is the
 * exact name queried; never the parent zone.
 */
export function verificationHostname(domain: string): string {
  return domain;
}

/** What the user publishes: the prefix is what makes the value findable at a
 * name that already carries SPF and other verifiers. */
export function verificationRecordValue(token: string): string {
  return `${VERIFICATION_VALUE_PREFIX}${token}`;
}
