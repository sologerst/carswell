"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { flush, pending } from "@/lib/offline/queue";

/**
 * Sends queued swipes from any buyer page (the deck manages its own queue),
 * so a like made just before opening Likes or Offers still lands.
 */
export function SwipeSync() {
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (path.startsWith("/deck")) return;
    let alive = true;
    const run = async () => {
      if (!(await pending()).length) return;
      const results = await flush();
      if (alive && results.some((r) => r.status === "ok")) router.refresh();
    };
    const t = setTimeout(run, 0);
    window.addEventListener("online", run);
    return () => {
      alive = false;
      clearTimeout(t);
      window.removeEventListener("online", run);
    };
  }, [path, router]);
  return null;
}
