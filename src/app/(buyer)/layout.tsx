import { InstallPrompt } from "@/components/pwa/install-prompt";
import { BuyerNav } from "@/components/shell/buyer-nav";
import { createClient } from "@/lib/supabase/server";
import { getDealerMemberships, requireOnboarded } from "@/lib/server/session";

export default async function BuyerLayout({ children }: LayoutProps<"/">) {
  const profile = await requireOnboarded();
  const supabase = await createClient();
  const [{ count }, memberships] = await Promise.all([
    supabase.from("interests").select("id", { count: "exact", head: true }).eq("user_id", profile.id).eq("status", "offered"),
    getDealerMemberships(),
  ]);
  return (
    <div className="min-h-dvh lg:pl-60">
      <BuyerNav offerCount={count ?? 0} appName={process.env.NEXT_PUBLIC_APP_NAME ?? "CarSwipe"} isDealer={memberships.length > 0} isAdmin={profile.is_admin} />
      <div className="pb-[calc(68px+var(--safe-bottom))] lg:pb-0">{children}</div>
      <InstallPrompt />
    </div>
  );
}
