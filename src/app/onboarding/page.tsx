import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingChat } from "@/components/onboarding/onboarding-chat";
import { features } from "@/lib/env";
import { requireProfile } from "@/lib/server/session";

export const metadata: Metadata = { title: "Tell me about your life" };

export default async function OnboardingPage() {
  const profile = await requireProfile("/onboarding");
  if (profile.onboarding_completed_at) redirect("/deck");
  return <OnboardingChat aiEnabled={features.ai} />;
}
