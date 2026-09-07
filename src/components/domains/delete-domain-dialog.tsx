"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDeleteClaim } from "@/hooks/use-claims";
import { toastApiError } from "@/lib/api/toast-error";

export function DeleteDomainDialog({
  claimId,
  domain,
  isVerified,
  trigger,
  onDeleted,
}: {
  claimId: string;
  domain: string;
  isVerified: boolean;
  trigger: React.ReactElement;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const deleteClaim = useDeleteClaim({
    onSuccess: () => {
      setOpen(false);
      onDeleted?.();
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {domain}?</AlertDialogTitle>
          <AlertDialogDescription>
            {isVerified
              ? `${domain} will stop being associated with your account, and anyone who controls its DNS can verify it instead. You can add it again, but you'll have to prove control from scratch.`
              : `This deletes the claim and its verification code. You can add ${domain} again later, but you'll get a new code.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleteClaim.isPending}
            onClick={() => deleteClaim.mutate(claimId, {
              onError: (error) => {
                // Close so the modal cannot obscure or isolate the toast.
                setOpen(false);
                toastApiError(
                  error,
                  "Couldn't delete the domain. Please try again.",
                );
              },
            })}
          >
            {deleteClaim.isPending ? "Deleting…" : "Delete domain"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
