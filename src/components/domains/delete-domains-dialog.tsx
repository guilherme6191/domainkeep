"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteClaims } from "@/hooks/use-claims";
import { toastApiError } from "@/lib/api/toast-error";
import type { ClaimView } from "@/lib/types";

export function DeleteDomainsDialog({
  claims,
  open,
  onOpenChange,
  onDeleted,
}: {
  claims: Pick<ClaimView, "id" | "domain" | "state">[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (deleted: string[]) => void;
}) {
  const deleteClaims = useDeleteClaims({
    onSuccess: (deleted) => {
      onOpenChange(false);
      onDeleted?.(deleted);
    },
  });

  const count = claims.length;
  const verifiedCount = claims.filter((c) => c.state === "verified").length;
  const noun = count === 1 ? "domain" : "domains";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {count} {noun}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {verifiedCount === 0
              ? `This deletes these claims and their verification codes. You can add them again later, but you'll get new codes.`
              : verifiedCount === count
                ? `These will stop being associated with your account, and anyone who controls their DNS can verify them instead. You can add them again, but you'll have to prove control from scratch.`
                : `${verifiedCount} of these ${verifiedCount === 1 ? "is" : "are"} verified. They'll stop being associated with your account, and anyone who controls their DNS can verify them instead. The rest lose their verification codes.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleteClaims.isPending || count === 0}
            onClick={() =>
              deleteClaims.mutate(
                claims.map((claim) => claim.id),
                {
                  onError: (error) => {
                    // Close so the modal cannot obscure or isolate the toast.
                    onOpenChange(false);
                    toastApiError(
                      error,
                      `Couldn't delete the ${noun}. Please try again.`,
                    );
                  },
                },
              )
            }
          >
            {deleteClaims.isPending ? "Deleting…" : `Delete ${count} ${noun}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
