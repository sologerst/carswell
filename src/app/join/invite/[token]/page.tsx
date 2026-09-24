import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { requireProfile } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Join your team" };

export default async function AcceptInvitePage({ params }: PageProps<"/join/invite/[token]">) {
  const { token } = await params;
  await requireProfile(`/join/invite/${token}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_dealer_invite", { p_token: token });
  if (!error) redirect("/dealer");
  return (
    <Card className="space-y-3 p-6 text-center">
      <h1 className="text-2xl font-bold">This invite didn&apos;t work</h1>
      <p className="text-muted">{error.message}. Ask the person who invited you to send a new link, and sign in with the email it was sent to.</p>
      <Button asChild><Link href="/">Home</Link></Button>
    </Card>
  );
}
