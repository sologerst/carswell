import Link from "next/link";
import { requireDealer } from "@/lib/server/session";

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
          <nav className="flex items-center gap-1 text-sm font-bold" aria-label="Dealer">
            <Link href="/dealer" className="tap inline-flex items-center rounded-full px-3 text-muted hover:text-ink">Leads</Link>
            <Link href="/dealer/settings" className="tap inline-flex items-center rounded-full px-3 text-muted hover:text-ink">Settings</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted md:inline">{membership.dealership.name}</span>
            {profile.onboarding_completed_at && <Link href="/deck" className="text-muted hover:text-ink">Buyer app</Link>}
            <form action="/auth/signout" method="post"><button className="text-muted hover:text-ink cursor-pointer">Sign out</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
