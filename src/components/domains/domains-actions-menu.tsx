"use client";

import { MoreHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function DomainsActionsMenu({
  selectedCount,
  onDeleteSelected,
}: {
  selectedCount: number;
  onDeleteSelected: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontalIcon />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {/* The menu closes on click, so the dialog is opened by the page, not here. */}
        {/* One text node, not two: the item is a flex row, so a separate
            count would be its own item and break onto its own line. */}
        <DropdownMenuItem
          variant="destructive"
          disabled={selectedCount === 0}
          onClick={onDeleteSelected}
          className="whitespace-nowrap"
        >
          {selectedCount > 0
            ? `Delete selected (${selectedCount})`
            : "Delete selected"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
