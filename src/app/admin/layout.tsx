import Link from "next/link";
import { requireAdmin } from "@/lib/server/session";

const NAV = [
  ["/admin", "Overview"],
  ["/admin/dealers", "Dealers"],
  ["/admin/moderation", "Moderation"],
  ["/admin/billing", "Billing"],
  ["/admin/market", "Market"],
  ["/admin/config", "Config"],
  ["/admin/outbox", "Outbox"],
  ["/admin/reports", "Reports"],
  ["/admin/ingest", "Jobs & ingest"],
  ["/admin/audit", "Audit log"],
] as const;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="pt-safe sticky top-0 z-20 border-b border-line bg-navy-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 lg:px-8">
          <Link href="/admin" className="flex items-center gap-2 font-bold"><span className="brand-gradient grid size-8 place-items-center rounded-lg">C</span> Admin</Link>
          <nav className="flex gap-1 overflow-x-auto text-sm font-bold scrollbar-none" aria-label="Admin">
            {NAV.map(([href, label]) => <Link key={href} href={href} className="tap inline-flex shrink-0 items-center rounded-full px-3 text-muted hover:text-ink">{label}</Link>)}
          </nav>
          <form action="/auth/signout" method="post" className="ml-auto"><button className="text-sm text-muted hover:text-ink cursor-pointer">Sign out</button></form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
