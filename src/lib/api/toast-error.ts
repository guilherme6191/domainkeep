import { toast } from "sonner";
import { ApiRequestError } from "@/lib/api/client";

/**
 * Surfaces a failed mutation as a toast. A classified API error already carries
 * a user-facing message and a request ID to correlate against server logs;
 * anything else (network, parse) gets the caller's fallback, because those
 * messages are not written for users to read.
 *
 * Wrap it rather than passing it straight to `onError`: React Query would
 * supply the mutation variables as the fallback.
 */
export function toastApiError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  const classified = error instanceof ApiRequestError;

  toast.error(classified ? error.message : fallback, {
    description:
      classified && error.requestId
        ? `Reference: ${error.requestId}`
        : undefined,
  });
}
