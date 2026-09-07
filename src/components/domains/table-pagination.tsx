"use client";

import { useRouter } from "next/navigation";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PAGE_SIZES,
  pageHref,
  pageRange,
  type PageSize,
} from "@/lib/pagination";
import { cn } from "@/lib/utils";

export function TablePagination({
  page,
  pageSize,
  pageCount,
  total,
}: {
  page: number;
  pageSize: PageSize;
  pageCount: number;
  total: number;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <span>
          {total} {total === 1 ? "domain" : "domains"}
        </span>
        <Select
          value={pageSize}
          // A different page size renumbers every page, so start again at one.
          onValueChange={(next) => next && router.push(pageHref(1, next))}
        >
          <SelectTrigger
            size="sm"
            className="w-[5.5rem]"
            aria-label="Rows per page"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={size}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>per page</span>
      </div>

      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            {/* Held in place rather than hidden at the bounds, so the bar doesn't shift. */}
            <PaginationPrevious
              href={pageHref(Math.max(1, page - 1), pageSize)}
              aria-disabled={page === 1}
              className={cn(page === 1 && "pointer-events-none opacity-50")}
            />
          </PaginationItem>

          {pageRange(page, pageCount).map((entry, index) => (
            <PaginationItem key={entry === "ellipsis" ? `gap-${index}` : entry}>
              {entry === "ellipsis" ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink
                  href={pageHref(entry, pageSize)}
                  isActive={entry === page}
                >
                  {entry}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}

          <PaginationItem>
            <PaginationNext
              href={pageHref(Math.min(pageCount, page + 1), pageSize)}
              aria-disabled={page === pageCount}
              className={cn(
                page === pageCount && "pointer-events-none opacity-50",
              )}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
