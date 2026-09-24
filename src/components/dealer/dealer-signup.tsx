"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PhoneVerify } from "@/components/phone/phone-verify";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, SectionTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";

/** Self-serve dealer signup: create the dealership, then verify its phone. */
export function DealerSignup({ matchedLeadPrice }: { matchedLeadPrice: number }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ name: "", address: "", city: "", zip: "", website: "", doc_fee: "" });
  const [dealershipId, setDealershipId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await createClient().rpc("create_dealership", {
      p: { ...f, doc_fee: f.doc_fee ? Number(f.doc_fee.replace(/[^\d.]/g, "")) : null },
    });
    setBusy(false);
    if (error) return toast(error.message, "error");
    setDealershipId(data);
  }

  if (dealershipId) {
    return (
      <Card className="space-y-4 p-6">
        <h1 className="text-2xl font-bold">Verify the dealership phone</h1>
        <p className="text-muted">We text a code to the store&apos;s main or sales line. CarSwipe then verifies your dealership (usually within a business day); you can upload inventory meanwhile.</p>
        <PhoneVerify purpose="dealership" dealershipId={dealershipId} onVerified={() => router.push("/dealer/inventory")} />
        <Button variant="ghost" onClick={() => router.push("/dealer/inventory")}>Skip for now</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Get leads from buyers who already like your cars</h1>
        <p className="mt-2 text-muted">Buyers swipe on nearby cars. When one likes yours, you get their intent (budget, trade, timeline) and send an out-the-door offer. Contact details unlock when they pick you. You pay only per matched lead (${matchedLeadPrice}), never per sale.</p>
      </div>
      <Card className="p-6">
        <SectionTitle>Your dealership</SectionTitle>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="name">Dealership name</Label><Input id="name" required value={f.name} onChange={set("name")} /></div>
          <div className="sm:col-span-2"><Label htmlFor="address">Street address</Label><Input id="address" value={f.address} onChange={set("address")} /></div>
          <div><Label htmlFor="city">City</Label><Input id="city" value={f.city} onChange={set("city")} /></div>
          <div><Label htmlFor="zip">ZIP</Label><Input id="zip" required inputMode="numeric" maxLength={5} value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value.replace(/\D/g, "") })} /></div>
          <div><Label htmlFor="website">Website</Label><Input id="website" type="url" placeholder="https://" value={f.website} onChange={set("website")} /></div>
          <div><Label htmlFor="doc_fee">Doc fee</Label><Input id="doc_fee" inputMode="decimal" placeholder="699" value={f.doc_fee} onChange={set("doc_fee")} /></div>
          <p className="text-xs text-subtle sm:col-span-2">By continuing you confirm you&apos;re authorized to represent this dealership and agree to the dealer terms. CarSwipe is an advertising and matching platform, not a dealer or broker.</p>
          <Button type="submit" size="lg" className="sm:col-span-2" disabled={busy || !f.name || f.zip.length !== 5}>Create dealer account</Button>
        </form>
      </Card>
    </div>
  );
}
