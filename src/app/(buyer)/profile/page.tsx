import type { Metadata } from "next";
import { ProfileView } from "@/components/profile/profile-view";
import { loadPrefs } from "@/lib/server/data";
import { requireOnboarded } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const profile = await requireOnboarded("/profile");
  const supabase = await createClient();
  const prefs = await loadPrefs(supabase, profile.id);
  const visible = Object.fromEntries(Object.entries(prefs).filter(([k]) => !k.startsWith("_") && k !== "life_story"));
  return (
    <ProfileView
      profile={{
        firstName: profile.first_name, email: profile.email, phone: profile.phone, zip: profile.zip, radiusMi: profile.radius_mi,
        paused: Boolean(profile.paused_at), summary: profile.ai_summary,
      }}
      prefs={visible}
      lifeStory={(prefs.life_story?.value as string | undefined) ?? null}
      vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
    />
  );
}
