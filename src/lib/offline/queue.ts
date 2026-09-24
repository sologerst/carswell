"use client";

import { get, set } from "idb-keyval";

// Offline swipe queue. Every swipe gets a client-generated id, so replaying the
// queue after a dropped connection is safe (record_swipes ignores duplicates).

export interface QueuedSwipe {
  client_id: string;
  listing_id?: string;
  action: "pass" | "like" | "superlike" | "undo";
  swiped_at: string;
  position?: number;
  exploration?: boolean;
  score?: number;
  undo_of?: string;
  test_drive_windows?: { day: string; time: string }[];
}

export interface SwipeResult {
  client_id: string;
  status: "ok" | "duplicate" | "limit" | "downgraded" | "invalid" | "not_found" | "unavailable";
  interest_id?: string;
}

const KEY = "carswipe:swipe-queue";
let memory: QueuedSwipe[] | null = null;
let flushing: Promise<SwipeResult[]> | null = null;

async function load(): Promise<QueuedSwipe[]> {
  if (memory) return memory;
  try {
    memory = ((await get(KEY)) as QueuedSwipe[] | undefined) ?? [];
  } catch {
    memory = [];
  }
  return memory;
}

async function save(q: QueuedSwipe[]) {
  memory = q;
  try {
    await set(KEY, q);
  } catch {
    // Private mode without IndexedDB: the in-memory queue still works this session.
  }
}

export async function enqueue(s: QueuedSwipe) {
  await save([...(await load()), s]);
  requestBackgroundSync();
}

/** Remove a not-yet-sent swipe (used by undo). Returns true if it was still queued. */
export async function dequeue(clientId: string): Promise<boolean> {
  const q = await load();
  if (!q.some((s) => s.client_id === clientId)) return false;
  await save(q.filter((s) => s.client_id !== clientId));
  return true;
}

export async function pending(): Promise<QueuedSwipe[]> {
  return [...(await load())];
}

/** Send everything queued. Safe to call often; concurrent calls share one request. */
export function flush(): Promise<SwipeResult[]> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      const q = await load();
      if (!q.length || (typeof navigator !== "undefined" && !navigator.onLine)) return [];
      const batch = q.slice(0, 200);
      const res = await fetch("/api/swipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swipes: batch }),
      });
      if (!res.ok) {
        // 4xx other than auth means a bad item; drop invalid ones rather than loop forever.
        if (res.status === 400) await save(q.filter((s) => !batch.includes(s)));
        return [];
      }
      const { results } = (await res.json()) as { results: SwipeResult[] };
      const sent = new Set(batch.map((s) => s.client_id));
      await save((await load()).filter((s) => !sent.has(s.client_id)));
      return results;
    } catch {
      return [];
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

function requestBackgroundSync() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register("flush-swipes"))
    .catch(() => {});
}
