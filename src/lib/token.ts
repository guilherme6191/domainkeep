import { randomBytes } from "node:crypto";

export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 256 random bits as hex: DNS-safe and derived from nothing. */
export function createVerificationToken(): string {
  return randomBytes(32).toString("hex");
}

export function tokenExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + TOKEN_TTL_MS);
}
