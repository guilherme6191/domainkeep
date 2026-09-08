"use client";

import { toast } from "sonner";
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
import { useTakeOver } from "@/hooks/use-claims";
import { toastApiError } from "@/lib/api/toast-error";

/**
 * The moment the whole flow exists for: the proof matched, the domain is
 * someone else's, and the transfer waits on an answer. Controlled by the
 * parent, which opens it both from the check that found the holder and from
 * the held panel afterwards — hence no trigger of its own.
 *
 * Cancelling sends nothing. The other account learns of this only if the user
 * confirms.
 */
export function TakeoverDialog({
  claimId,
  domain,
  open,
  onOpenChange,
}: {
  claimId: string;
  domain: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const takeOver = useTakeOver(claimId);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Another account holds {domain}</AlertDialogTitle>
          <AlertDialogDescription render={<div className="space-y-2" />}>
            <p>
              Your DNS record matched, so you control this domain. It is
              currently verified in another account. Taking it over moves it to
              yours, and the other account is told it moved.
            </p>
            <p>
              If that isn&rsquo;t expected, cancel and check with whoever
              manages the domain first. If the domain is yours now — you bought
              it, or took over its DNS — go ahead.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={takeOver.isPending}
            onClick={() => takeOver.mutate(undefined, {
              onSuccess: (updated) => {
                onOpenChange(false);
                // The transfer runs its own lookup and its own guards, so the
                // answer may be anything from a verified claim to a fresh DNS
                // failure. The panel behind names the outcome; the toast says
                // only whether the domain moved.
                if (updated.state === "verified") {
                  toast.success(`You control ${updated.domain}.`);
                } else {
                  toast(`${updated.domain} didn't move.`);
                }
              },
              onError: (error) => {
                // Close so the modal cannot obscure or isolate the toast.
                onOpenChange(false);
                toastApiError(
                  error,
                  "Couldn't take over the domain. Please try again.",
                );
              },
            })}
          >
            {takeOver.isPending ? "Taking over…" : "Take over"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
