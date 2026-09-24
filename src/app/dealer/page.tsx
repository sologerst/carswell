import type { Metadata } from "next";
import { DealerInbox } from "@/components/dealer/dealer-inbox";
import { loadConfig } from "@/lib/server/data";
import { loadLeads } from "@/lib/server/dealer";
import { requireDealer } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dealer inbox" };

export default async function DealerHome() {
  const { membership } = await requireDealer();
  const supabase = await createClient();
  const config = await loadConfig(supabase);
  const leads = await loadLeads(supabase, membership.dealership_id, config);
  return <DealerInbox leads={leads} dealerName={membership.dealership.name} />;
}
