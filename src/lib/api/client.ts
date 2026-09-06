import type { ApiError, ClaimView } from "@/lib/types";

export class ApiRequestError extends Error {
  constructor(
    readonly code: ApiError["error"]["code"],
    message: string,
    readonly requestId: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (body as ApiError | null)?.error;
    throw new ApiRequestError(
      error?.code ?? "internal_error",
      error?.message ?? "Something went wrong. Please try again.",
      error?.requestId ?? "",
    );
  }

  return body as T;
}

export const claimsApi = {
  list: () => request<ClaimView[]>("/api/claims"),
  get: (id: string) => request<ClaimView>(`/api/claims/${id}`),
  create: (domain: string) =>
    request<ClaimView>("/api/claims", {
      method: "POST",
      body: JSON.stringify({ domain }),
    }),
  updateDomain: (id: string, domain: string) =>
    request<ClaimView>(`/api/claims/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ domain }),
    }),
  verify: (id: string) =>
    request<ClaimView>(`/api/claims/${id}/verify`, { method: "POST" }),
  replaceToken: (id: string) =>
    request<ClaimView>(`/api/claims/${id}/replace-token`, { method: "POST" }),
  remove: (id: string) =>
    request<void>(`/api/claims/${id}`, { method: "DELETE" }),
};
