import "server-only";

import webpush from "web-push";
import { env, features } from "../env";
import type { AdminSupabase } from "../supabase/admin";

let configured = false;
function configure() {
  if (configured || !features.push) return;
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey!, env.vapidPrivateKey!);
  configured = true;
}

/** Push any notifications that haven't been pushed yet. No-op without VAPID keys. */
export async function pushPendingNotifications(admin: AdminSupabase, limit = 200): Promise<number> {
  if (!features.push) return 0;
  configure();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: pending } = await admin
    .from("notifications")
    .select("id, user_id, title, body, url")
    .is("pushed_at", null)
    .gte("created_at", since)
    .order("created_at")
    .limit(limit);
  let sent = 0;
  for (const n of pending ?? []) {
    const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", n.user_id);
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: n.title, body: n.body, url: n.url ?? "/" }),
          { TTL: 3600 },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
    await admin.from("notifications").update({ pushed_at: new Date().toISOString() }).eq("id", n.id);
  }
  return sent;
}
