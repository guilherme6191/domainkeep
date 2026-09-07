/** Shared by the route handler and the client, so both read a URL the same way. */

export const PAGE_SIZES = [40, 80, 120] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = PAGE_SIZES[0];

/** Past this the offset overflows the database's bigint instead of paging. */
const MAX_PAGE = 1_000_000;

/** Malformed input is the ordinary case, not an error: it means page 1. */
export function parsePage(value: string | null): number {
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) return 1;
  return Math.min(page, MAX_PAGE);
}

/** An allowlist, not a cap: an unoffered size is not a smaller page, it is no request. */
export function parsePageSize(value: string | null): PageSize {
  const size = Number(value);
  return PAGE_SIZES.find((offered) => offered === size) ?? DEFAULT_PAGE_SIZE;
}

export function pageHref(page: number, pageSize: PageSize): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(pageSize));
  const query = params.toString();
  return query ? `/domains?${query}` : "/domains";
}

/** First, last, and the current page's neighbours; "ellipsis" marks each gap. */
export function pageRange(
  page: number,
  pageCount: number,
): (number | "ellipsis")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const shown = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((n) => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b);

  return shown.flatMap((n, index) =>
    index > 0 && n - shown[index - 1] > 1 ? ["ellipsis" as const, n] : [n],
  );
}
