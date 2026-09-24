import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { requireProfile } from "@/lib/server/session";

export const metadata: Metadata = { title: "Quick setup" };

export default async function OnboardingFormPage() {
  const profile = await requireProfile("/onboarding/form");
  if (profile.onboarding_completed_at) redirect("/deck");
  return <OnboardingForm initialZip={profile.zip ?? ""} />;
}
