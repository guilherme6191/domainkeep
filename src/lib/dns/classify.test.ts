import { describe, expect, it } from "vitest";
import { classifyTxtLookup, MAX_OBSERVED_VALUES } from "@/lib/dns/classify";

const TOKEN = "a".repeat(64);
const VALUE = `resend-verify=${TOKEN}`;

describe("classifyTxtLookup", () => {
  it("verifies when any record matches exactly", () => {
    expect(
      classifyTxtLookup(
        { outcome: "records", records: [["v=spf1 -all"], [VALUE]] },
        TOKEN,
      ),
    ).toEqual({ result: "verified" });
  });

  it("rejoins a record split into 255-byte chunks before comparing", () => {
    // Split inside the prefix: the filter reads the rejoined value, not a chunk.
    const chunks = [VALUE.slice(0, 8), VALUE.slice(8)];
    expect(
      classifyTxtLookup({ outcome: "records", records: [chunks] }, TOKEN),
    ).toEqual({ result: "verified" });
  });

  it("does not match across separate records", () => {
    const outcome = classifyTxtLookup(
      {
        outcome: "records",
        records: [[VALUE.slice(0, 40)], [`resend-verify=${TOKEN.slice(40)}`]],
      },
      TOKEN,
    );
    expect(outcome.result).toBe("value_mismatch");
  });

  it("reports a mismatch with the values it actually saw", () => {
    expect(
      classifyTxtLookup(
        { outcome: "records", records: [["resend-verify=not-the-token"]] },
        TOKEN,
      ),
    ).toEqual({
      result: "value_mismatch",
      observedValues: ["resend-verify=not-the-token"],
    });
  });

  it("only ever considers prefixed values, so SPF is neither matched nor shown", () => {
    // A bare token is not the format we ask for, so it does not count either.
    expect(
      classifyTxtLookup(
        {
          outcome: "records",
          records: [["v=spf1 include:_spf.google.com ~all"], [TOKEN]],
        },
        TOKEN,
      ),
    ).toEqual({ result: "record_not_found" });

    expect(
      classifyTxtLookup(
        {
          outcome: "records",
          records: [
            ["v=spf1 -all"],
            ["google-site-verification=abc"],
            ["resend-verify=stale"],
          ],
        },
        TOKEN,
      ),
    ).toEqual({ result: "value_mismatch", observedValues: ["resend-verify=stale"] });
  });

  it("bounds how many observed values it will keep", () => {
    const records = Array.from({ length: 20 }, (_, index) => [
      `resend-verify=value-${index}`,
    ]);
    const outcome = classifyTxtLookup({ outcome: "records", records }, TOKEN);
    expect(
      outcome.result === "value_mismatch" && outcome.observedValues.length,
    ).toBe(MAX_OBSERVED_VALUES);
  });

  it("treats an empty answer as a missing record", () => {
    expect(
      classifyTxtLookup({ outcome: "records", records: [] }, TOKEN),
    ).toEqual({ result: "record_not_found" });
    expect(classifyTxtLookup({ outcome: "not_found" }, TOKEN)).toEqual({
      result: "record_not_found",
    });
  });

  it("never blames the user for a resolver failure", () => {
    expect(classifyTxtLookup({ outcome: "temporary_failure" }, TOKEN)).toEqual({
      result: "temporary_dns_error",
    });
  });
});
