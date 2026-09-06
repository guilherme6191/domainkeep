import { NextResponse } from "next/server";
import type { ApiError, ErrorCode } from "@/lib/types";

const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  not_found: 404,
  invalid_domain: 400,
  claim_locked: 409,
  internal_error: 500,
};

/** `message` is always safe to render; details go to the log under `requestId`. */
export function apiError(
  code: ErrorCode,
  message: string,
  requestId = crypto.randomUUID(),
): NextResponse<ApiError> {
  return NextResponse.json<ApiError>(
    { error: { code, message, requestId } },
    { status: STATUS[code] },
  );
}

export function internalError(context: string, error: unknown): NextResponse<ApiError> {
  const requestId = crypto.randomUUID();
  console.error(`[${requestId}] ${context}`, error);
  return apiError(
    "internal_error",
    "Something went wrong on our side. Please try again.",
    requestId,
  );
}

export const NOT_FOUND_MESSAGE = "We couldn't find that domain.";
