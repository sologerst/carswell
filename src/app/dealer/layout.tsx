import Link from "next/link";
import { requireDealer } from "@/lib/server/session";

const NAV = [
  ["/dealer", "Leads"],
  ["/dealer/inventory", "Inventory"],
  ["/dealer/insights", "Insights"],
  ["/dealer/team", "Team"],
  ["/dealer/billing", "Billing"],
  ["/dealer/settings", "Settings"],
] as const;

export default async function DealerLayout({ children }: LayoutProps<"/dealer">) {
  const { profile, membership } = await requireDealer();
  return (
    <div className="min-h-dvh">
      <header className="pt-safe sticky top-0 z-20 border-b border-line bg-navy-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 lg:px-8">
          <Link href="/dealer" className="flex items-center gap-2">
            <span className="brand-gradient grid size-8 place-items-center rounded-lg font-bold">C</span>
            <span className="hidden font-bold sm:inline">Dealer inbox</span>
          </Link>
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm font-bold scrollbar-none" aria-label="Dealer">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="tap inline-flex shrink-0 items-center rounded-full px-3 text-muted hover:text-ink">{label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted md:inline">{membership.dealership.name}</span>
            {profile.onboarding_completed_at && <Link href="/deck" className="text-muted hover:text-ink">Buyer app</Link>}
            <form action="/auth/signout" method="post"><button className="text-muted hover:text-ink cursor-pointer">Sign out</button></form>
          </div>
        </div>
      </header>
      {!membership.dealership.verified_at && (
        <div className="border-b border-deal-fair/30 bg-deal-fair/10">
          <p className="mx-auto max-w-7xl px-4 py-2 text-sm lg:px-8">
            <span className="font-bold text-deal-fair">Pending verification.</span> Upload your inventory now; it goes live in buyer decks once CarSwipe verifies {membership.dealership.name}.
            {!membership.dealership.phone_verified_at && <> <Link href="/dealer/settings" className="font-bold underline">Verify your phone</Link> to speed it up.</>}
          </p>
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
