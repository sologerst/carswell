/* CarSwipe service worker: offline shell, cached car photos, push. */
const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const STATIC = `static-${VERSION}`;
const PHOTOS = `photos-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const PRECACHE = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon.svg"];
const MAX_PHOTOS = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, STATIC, PHOTOS, PAGES]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache API calls or auth; the app queues swipes itself when offline.
  if (url.origin === self.location.origin && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/"))) return;

  // Immutable build assets: cache first.
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.open(STATIC).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Car photos (fixture renders and hotlinked dealer photos): cache first, so
  // the next cards in the deck still show when you swipe offline.
  if (req.destination === "image") {
    event.respondWith(caches.open(PHOTOS).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === "opaque") {
          cache.put(req, res.clone());
          trim(PHOTOS, MAX_PHOTOS);
        }
        return res;
      } catch {
        return new Response("", { status: 504 });
      }
    }));
    return;
  }

  // Pages: network first, fall back to the last copy, then the offline page.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(PAGES)).put(req, res.clone());
        return res;
      } catch {
        return (await caches.match(req)) ?? (await caches.match("/offline")) ?? Response.error();
      }
    })());
  }
});

// Background Sync (Android/Chrome): ask open pages to flush queued swipes.
self.addEventListener("sync", (event) => {
  if (event.tag === "flush-swipes") {
    event.waitUntil(self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const c of clients) c.postMessage({ type: "flush-swipes" });
    }));
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "CarSwipe", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    data: { url: data.url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const c of clients) {
      if (c.url === target && "focus" in c) return c.focus();
    }
    return self.clients.openWindow(target);
  }));
});
