"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, DealBadge, Input, Label, SectionTitle, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { dealBand } from "@/lib/deal";
import { api } from "@/lib/utils";

/** Price, description and state changes for a published private listing. */
export function ListingManager({ id, price, description, expected, state }: {
  id: string;
  price: number;
  description: string;
  expected: number | null;
  state: "live" | "paused" | "sold" | "pending" | "rejected";
}) {
  const router = useRouter();
  const toast = useToast();
  const [p, setP] = useState(String(Math.round(price)));
  const [d, setD] = useState(description);
  const [busy, setBusy] = useState(false);
  const band = dealBand(Number(p) || 0, expected);

  async function save() {
    setBusy(true);
    try {
      await api(`/api/sell/listings/${id}`, { method: "PATCH", json: { price: Number(p), ...(d !== description ? { description: d } : {}) } });
      toast("Saved.", "success");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function act(action: "sold" | "pause" | "relist" | "delete") {
    if (action === "delete" && !confirm("Delete this listing? Buyers who liked it will see it as no longer available.")) return;
    setBusy(true);
    try {
      await api(`/api/sell/listings/${id}`, { json: { action } });
      toast(action === "sold" ? "Marked as sold. Congrats!" : action === "relist" ? "Relisted." : action === "pause" ? "Paused." : "Deleted.");
      if (action === "delete") router.push("/sell");
      else router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const editable = state === "live" || state === "paused";
  return (
    <Card className="space-y-4 p-5">
      <SectionTitle>Manage</SectionTitle>
      {editable && (
        <>
          <div>
            <Label htmlFor="price">Price</Label>
            <div className="flex items-center gap-2">
              <Input id="price" inputMode="numeric" value={p} onChange={(e) => setP(e.target.value.replace(/\D/g, ""))} />
              <DealBadge rating={band} className="shrink-0 whitespace-nowrap" />
            </div>
          </div>
          <div>
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" rows={5} value={d} onChange={(e) => setD(e.target.value)} />
          </div>
          <Button onClick={save} disabled={busy || Number(p) < 500} className="w-full">Save changes</Button>
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        {state === "live" && <Button variant="secondary" onClick={() => act("sold")} disabled={busy}>Mark sold</Button>}
        {state === "live" && <Button variant="secondary" onClick={() => act("pause")} disabled={busy}>Pause</Button>}
        {state === "paused" && <Button variant="secondary" onClick={() => act("relist")} disabled={busy}>Relist</Button>}
        <Button variant="danger" onClick={() => act("delete")} disabled={busy}>Delete</Button>
      </div>
    </Card>
  );
}
