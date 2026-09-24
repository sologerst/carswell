import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DealerSignup } from "@/components/dealer/dealer-signup";
import { loadConfig } from "@/lib/server/data";
import { getDealerMemberships, requireProfile } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Join as a dealer" };

export default async function JoinDealerPage() {
  await requireProfile("/join/dealer");
  if ((await getDealerMemberships()).length) redirect("/dealer");
  const config = await loadConfig(await createClient());
  return <DealerSignup matchedLeadPrice={config.billing.matched_lead_price_usd} />;
}
