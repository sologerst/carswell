import Link from "next/link";
import { requireProfile } from "@/lib/server/session";

export default async function SellLayout({ children }: LayoutProps<"/sell">) {
  const profile = await requireProfile("/sell");
  return (
    <div className="min-h-dvh">
      <header className="pt-safe sticky top-0 z-20 border-b border-line bg-navy-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4">
          <Link href="/sell" className="flex items-center gap-2">
            <span className="brand-gradient grid size-8 place-items-center rounded-lg font-bold">C</span>
            <span className="font-bold">Sell</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm font-bold" aria-label="Selling">
            <Link href="/sell" className="tap inline-flex items-center rounded-full px-3 text-muted hover:text-ink">My cars</Link>
            <Link href="/sell/leads" className="tap inline-flex items-center rounded-full px-3 text-muted hover:text-ink">Buyers</Link>
          </nav>
          <div className="ml-auto text-sm">
            <Link href={profile.onboarding_completed_at ? "/deck" : "/"} className="text-muted hover:text-ink">{profile.onboarding_completed_at ? "Shop cars" : "Home"}</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
