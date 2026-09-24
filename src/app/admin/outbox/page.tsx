import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, Pill, Textarea } from "@/components/ui/primitives";
import { features } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { simulateDealerReply } from "../actions";

export const metadata: Metadata = { title: "Outbox" };
export const dynamic = "force-dynamic";

/** Emails captured while RESEND_API_KEY is unset, plus a dealer-reply simulator. */
export default async function AdminOutbox() {
  const { data } = await createAdminClient().from("dev_outbox").select("*").order("created_at", { ascending: false }).limit(50);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Outbox</h1>
      <p className="mb-6 text-sm text-muted">
        {features.email ? "Resend is configured; new emails are sent for real. Older captured emails are listed below." : "Resend isn't configured, so emails land here instead of being sent."}
      </p>
      {(data ?? []).length === 0 && <p className="rounded-3xl border border-dashed border-line px-6 py-12 text-center text-muted">No emails yet. Like a car from an email-channel dealer to generate an ADF lead.</p>}
      <div className="space-y-4">
        {(data ?? []).map((m) => (
          <Card key={m.id} className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="accent">{m.kind}</Pill>
              <p className="font-bold">{m.subject}</p>
              <span className="ml-auto text-xs text-subtle">{new Date(m.created_at).toLocaleString("en-US")}</span>
            </div>
            <p className="mt-1 text-xs text-muted">To {m.to_address} · from {m.from_address}{m.reply_to ? ` · reply-to ${m.reply_to}` : ""}</p>
            {m.html_body && <div className="mt-3 rounded-2xl bg-white p-4 text-sm text-navy-950 [&_a]:text-[#5a49f5]" dangerouslySetInnerHTML={{ __html: m.html_body }} />}
            {m.text_body && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-bold text-muted">Plain-text / ADF XML</summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded-2xl bg-navy-850 p-3 text-xs">{m.text_body}</pre>
              </details>
            )}
            {m.reply_to && (
              <form action={simulateDealerReply} className="mt-4 space-y-2 rounded-2xl border border-dashed border-line p-3">
                <input type="hidden" name="to" value={m.reply_to} />
                <p className="text-xs font-bold text-muted">Simulate the dealer replying by email (runs the inbound webhook logic)</p>
                <Textarea name="text" rows={3} defaultValue={"Thanks for your interest! Our best out the door price is $27,450 including tax, title and all fees. Doc fee $599.\n\nOn Tue, CarSwipe wrote:\n> lead"} />
                <Button size="sm" type="submit">Send simulated reply</Button>
              </form>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
