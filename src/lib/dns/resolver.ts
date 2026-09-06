/**
 * The one seam where DNS is faked in tests. Returns a closed union instead of
 * throwing; resolver error codes never leave this module.
 */
export type TxtLookup =
  | { outcome: "records"; records: string[][] }
  | { outcome: "not_found" }
  | { outcome: "temporary_failure" };

export interface DnsResolver {
  resolveTxt(hostname: string): Promise<TxtLookup>;
}

// The name exists nowhere or holds no TXT: user-fixable.
const NOT_FOUND_CODES = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

export const nodeDnsResolver: DnsResolver = {
  async resolveTxt(hostname: string): Promise<TxtLookup> {
    const { Resolver } = await import("node:dns/promises");
    // One bounded attempt; a lost packet is reported as `temporary_failure`.
    const resolver = new Resolver({ timeout: 4000, tries: 1 });

    try {
      const records = await resolver.resolveTxt(hostname);
      return { outcome: "records", records };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (NOT_FOUND_CODES.has(code)) return { outcome: "not_found" };
      // SERVFAIL, REFUSED, timeouts: the resolver's problem, never a user error.
      return { outcome: "temporary_failure" };
    }
  },
};
