import type { TxtLookup } from "@/lib/dns/resolver";
import { verificationRecordValue } from "@/lib/domain";
import { VERIFICATION_VALUE_PREFIX } from "@/lib/types";

export type CheckOutcome =
  | { result: "verified" }
  | { result: "record_not_found" }
  | { result: "value_mismatch"; observedValues: string[] }
  | { result: "temporary_dns_error" };

/** Bounded before storage: observed values are attacker-influenced input. */
export const MAX_OBSERVED_VALUES = 5;
export const MAX_OBSERVED_VALUE_LENGTH = 255;

/**
 * Pure. Chunked TXT records are reassembled before comparison. Only values
 * carrying the `resend-verify=` prefix are considered, so SPF and other
 * verifiers at the same name are neither matched against nor reported back;
 * a name with none of them reads as a missing record, not a mismatch.
 */
export function classifyTxtLookup(
  lookup: TxtLookup,
  expectedToken: string,
): CheckOutcome {
  if (lookup.outcome === "temporary_failure") {
    return { result: "temporary_dns_error" };
  }
  if (lookup.outcome === "not_found") {
    return { result: "record_not_found" };
  }

  const observedValues = lookup.records
    .map((chunks) => chunks.join(""))
    .filter((value) => value.startsWith(VERIFICATION_VALUE_PREFIX));

  if (observedValues.length === 0) {
    return { result: "record_not_found" };
  }

  if (observedValues.includes(verificationRecordValue(expectedToken))) {
    return { result: "verified" };
  }

  return {
    result: "value_mismatch",
    observedValues: observedValues
      .slice(0, MAX_OBSERVED_VALUES)
      .map((value) => value.slice(0, MAX_OBSERVED_VALUE_LENGTH)),
  };
}
