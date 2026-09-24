import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BillOfSale } from "@/components/journey/bill-of-sale";
import { PrintButton } from "@/components/journey/print-button";
import { loadBillOfSale } from "@/lib/server/journey";
import { requireProfile } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bill of sale" };

export default async function SellerBillOfSale({ params }: PageProps<"/sell/leads/[id]/bill-of-sale">) {
  const { id } = await params;
  const profile = await requireProfile(`/sell/leads/${id}/bill-of-sale`);
  const data = await loadBillOfSale(await createClient(), id, { sellerFirstName: profile.first_name });
  if (!data) notFound();
  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden"><PrintButton /></div>
      <BillOfSale d={data} />
    </div>
  );
}
