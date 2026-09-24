import type { Metadata } from "next";
import { DealerInbox } from "@/components/dealer/dealer-inbox";
import { loadSellerLeads } from "@/lib/server/dealer";
import { requireProfile } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Interested buyers" };

export default async function SellerLeadsPage() {
  const profile = await requireProfile("/sell/leads");
  const supabase = await createClient();
  const leads = await loadSellerLeads(supabase);
  return (
    <DealerInbox
      leads={leads}
      dealerName={profile.first_name ?? "Your cars"}
      basePath="/sell/leads"
      heading="Interested buyers"
      intro="buyers who liked your car. Reply with a price within 72 hours; chat opens when they accept."
    />
  );
}
