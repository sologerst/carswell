import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BillOfSale } from "@/components/journey/bill-of-sale";
import { PrintButton } from "@/components/journey/print-button";
import { loadBillOfSale } from "@/lib/server/journey";
import { requireOnboarded } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bill of sale" };

export default async function BuyerBillOfSale({ params }: PageProps<"/journey/[id]/bill-of-sale">) {
  const { id } = await params;
  const profile = await requireOnboarded(`/journey/${id}/bill-of-sale`);
  const data = await loadBillOfSale(await createClient(), id, { buyerFirstName: profile.first_name });
  if (!data) notFound();
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 pt-safe pb-10 print:p-0">
      <div className="flex justify-end pt-4 print:hidden"><PrintButton /></div>
      <BillOfSale d={data} />
    </main>
  );
}
