"use client";

import { Pencil } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEditDomain } from "@/hooks/use-claims";
import { ApiRequestError } from "@/lib/api/client";
import { normalizeDomain } from "@/lib/domain";

// Edits in place: same id, new challenge, user stays on the same page.
export function EditDomainDialog({
  claimId,
  domain,
}: {
  claimId: string;
  domain: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(domain);
  const [error, setError] = useState<string | null>(null);
  const editDomain = useEditDomain(claimId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const normalized = normalizeDomain(value);
    if (!normalized.ok) {
      setError(normalized.message);
      return;
    }

    editDomain.mutate(normalized.domain, {
      onSuccess: () => setOpen(false),
      onError: (mutationError) =>
        setError(
          mutationError instanceof ApiRequestError
            ? mutationError.message
            : "Something went wrong. Please try again.",
        ),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValue(domain);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Edit domain"
          />
        }
      >
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit domain</DialogTitle>
            <DialogDescription>
              Fix a typo without starting over. This generates a new code, so
              you&rsquo;ll need to publish the record again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label htmlFor="edit-domain">Domain</Label>
            <Input
              id="edit-domain"
              value={value}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => {
                setValue(event.target.value);
                if (error) setError(null);
              }}
              aria-invalid={error ? true : undefined}
            />
            {error ? (
              <p className="text-destructive text-sm">{error}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={editDomain.isPending}>
              {editDomain.isPending ? "Saving…" : "Save domain"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
