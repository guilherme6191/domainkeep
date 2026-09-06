"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAddDomain } from "@/hooks/use-claims";
import { ApiRequestError } from "@/lib/api/client";
import { normalizeDomain } from "@/lib/domain";

export function AddDomainForm() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isNavigating, startNavigation] = useTransition();
  const addDomain = useAddDomain();

  // Busy until the detail page takes over, so a second create can't fire
  // mid-navigation.
  const isBusy = addDomain.isPending || isNavigating;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Early feedback; the server makes the authoritative decision.
    const normalized = normalizeDomain(domain);
    if (!normalized.ok) {
      setError(normalized.message);
      return;
    }

    addDomain.mutate(normalized.domain, {
      onSuccess: (claim) => {
        // Navigate out from under the dialog; closing it first would uncover
        // the list for the length of the route change.
        startNavigation(() => router.push(`/domains/${claim.id}`));
      },
      onError: (mutationError) => {
        setError(
          mutationError instanceof ApiRequestError
            ? mutationError.message
            : "Something went wrong. Please try again.",
        );
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="domain">Domain</Label>
        <Input
          id="domain"
          name="domain"
          placeholder="example.com"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={domain}
          onChange={(event) => {
            setDomain(event.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby="domain-hint"
        />
        <p id="domain-hint" className="text-muted-foreground text-[13px]">
          {error ?? "Enter the exact domain or subdomain you want to verify."}
        </p>
      </div>

      <Button type="submit" disabled={isBusy} className="w-full">
        {isBusy ? "Adding…" : "Add domain"}
      </Button>
    </form>
  );
}
