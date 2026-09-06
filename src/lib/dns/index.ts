import "server-only";
import { nodeDnsResolver, type DnsResolver } from "@/lib/dns/resolver";

let resolver: DnsResolver = nodeDnsResolver;

export function getResolver(): DnsResolver {
  return resolver;
}

/** Test injection point. */
export function setResolver(next: DnsResolver): void {
  resolver = next;
}

export function resetResolver(): void {
  resolver = nodeDnsResolver;
}
