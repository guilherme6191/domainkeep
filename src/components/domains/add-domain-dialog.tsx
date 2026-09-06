"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AddDomainForm } from "@/components/domains/add-domain-form";

// Uncontrolled: a successful add navigates away, which unmounts the dialog.
// Nothing closes it programmatically.
export function AddDomainDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>Add domain</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a domain</DialogTitle>
          <DialogDescription>
            Verify that you control a domain by adding one DNS record.
          </DialogDescription>
        </DialogHeader>
        <AddDomainForm />
      </DialogContent>
    </Dialog>
  );
}
