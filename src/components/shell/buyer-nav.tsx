"use client";

import { Heart, Layers, Tag, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/deck", label: "Deck", icon: Layers },
  { href: "/likes", label: "Likes", icon: Heart },
  { href: "/offers", label: "Offers", icon: Tag },
  { href: "/profile", label: "Profile", icon: User },
];

/** Four bottom tabs on phones; a left rail on desktop. */
export function BuyerNav({ offerCount, appName, isDealer, isAdmin }: { offerCount: number; appName: string; isDealer: boolean; isAdmin: boolean }) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(`${href}/`) || (href === "/offers" && path.startsWith("/chat"));
  return (
    <>
      <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-navy-950/92 backdrop-blur-xl lg:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} aria-current={active(href) ? "page" : undefined}
                className={cn("tap relative flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold", active(href) ? "text-ink" : "text-subtle")}>
                <Icon className={cn("size-6", active(href) && href === "/likes" && "fill-accent text-accent")} />
                {label}
                {href === "/offers" && offerCount > 0 && (
                  <span className="absolute right-[calc(50%-22px)] top-1.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] text-white">{offerCount}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-label="Main" className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-line bg-navy-950 px-4 py-6 lg:flex">
        <Link href="/deck" className="mb-8 flex items-center gap-2 px-2">
          <span className="brand-gradient grid size-9 place-items-center rounded-xl text-lg font-bold">C</span>
          <span className="text-lg font-bold tracking-tight">{appName}</span>
        </Link>
        <ul className="space-y-1">
          {TABS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} aria-current={active(href) ? "page" : undefined}
                className={cn("tap flex items-center gap-3 rounded-2xl px-3 font-bold", active(href) ? "bg-navy-800 text-ink" : "text-muted hover:bg-navy-900 hover:text-ink")}>
                <Icon className="size-5" /> {label}
                {href === "/offers" && offerCount > 0 && <span className="ml-auto rounded-full bg-accent px-2 text-xs text-white">{offerCount}</span>}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-auto space-y-1 text-sm">
          {isDealer && <Link href="/dealer" className="tap flex items-center rounded-2xl px-3 font-bold text-muted hover:text-ink">Dealer inbox</Link>}
          {isAdmin && <Link href="/admin" className="tap flex items-center rounded-2xl px-3 font-bold text-muted hover:text-ink">Admin</Link>}
          <div className="px-3 pt-4 text-xs text-subtle">
            <p className="mb-1 font-bold uppercase tracking-widest">Keyboard</p>
            <p>← pass · → like · ↑ test drive</p>
            <p>Z undo · Enter details</p>
          </div>
        </div>
      </nav>
    </>
  );
}
