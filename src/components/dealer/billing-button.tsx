"use client";

import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/utils";

/** Opens Stripe Checkout or the billing portal. */
export function BillingButton({ body, children, ...props }: { body: Record<string, unknown> } & ButtonProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button {...props} disabled={busy || props.disabled} onClick={async () => {
      setBusy(true);
      try {
        const { url } = await api<{ url: string }>("/api/dealer/billing", { json: body });
        window.location.assign(url);
      } catch (e) {
        toast((e as Error).message, "error");
        setBusy(false);
      }
    }}>
      {children}
    </Button>
  );
}
