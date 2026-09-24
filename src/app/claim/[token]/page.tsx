import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Claim your dealership" };

async function claim(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_dealership", { p_token: token });
  if (error) redirect(`/claim/${encodeURIComponent(token)}?error=${encodeURIComponent(error.message)}`);
  redirect("/dealer");
}

/** Claim link from an ADF lead email: an off-platform dealer gets a free inbox. */
export default async function ClaimPage({ params, searchParams }: PageProps<"/claim/[token]">) {
  const { token } = await params;
  const { error } = await searchParams;
  await requireProfile(`/claim/${token}`);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-3xl font-bold tracking-tight">Claim your dealer inbox</h1>
      <p className="mt-3 text-muted">
        See buyers who liked your cars, their budget, financing, trade-in and timeline, and answer with out-the-door offers.
        Contact details unlock when a buyer picks your offer.
      </p>
      {typeof error === "string" && <p className="mt-4 rounded-2xl bg-deal-bad/15 px-4 py-3 text-sm font-bold text-deal-bad">{error}</p>}
      <form action={claim} className="mt-8">
        <input type="hidden" name="token" value={token} />
        <Button size="lg" type="submit" className="w-full">Claim dealership</Button>
      </form>
    </main>
  );
}
