/** Self-identifying prefix on the published value; only prefixed values count. */
export const VERIFICATION_VALUE_PREFIX = "resend-verify=";

export type LastCheckResult =
  | "record_not_found"
  | "value_mismatch"
  | "temporary_dns_error";

export type LastCheck =
  | { result: "record_not_found"; checkedAt: Date }
  | { result: "value_mismatch"; observedValues: string[]; checkedAt: Date }
  | { result: "temporary_dns_error"; checkedAt: Date };

/** The persisted row. */
export interface DomainClaim {
  id: string;
  normalizedDomain: string;
  ownerId: string;
  verificationToken: string;
  tokenExpiresAt: Date;
  verifiedAt: Date | null;
  supersededAt: Date | null;
  tookOverAt: Date | null;
  lastCheck: LastCheck | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Derived, never stored. */
export type ClaimViewState =
  | "verified"
  | "superseded"
  | "expired"
  | "setup_required"
  | "record_not_found"
  | "value_mismatch"
  | "temporary_dns_error";

export type LastCheckView =
  | { result: "record_not_found"; checkedAt: string }
  | { result: "value_mismatch"; observedValues: string[]; checkedAt: string }
  | { result: "temporary_dns_error"; checkedAt: string };

/** The API projection: adds derived `state`, never carries `ownerId`. */
export interface ClaimView {
  id: string;
  domain: string;
  verificationHostname: string;
  token: string;
  recordValue: string;
  tokenExpiresAt: string;
  verifiedAt: string | null;
  supersededAt: string | null;
  lastCheck: LastCheckView | null;
  state: ClaimViewState;
  tookOverAt: string | null;
  createdAt: string;
}

export type ErrorCode =
  | "unauthenticated"
  | "not_found"
  | "invalid_domain"
  | "claim_locked"
  | "internal_error";

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
  };
}
