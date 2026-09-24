import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, Pill } from "@/components/ui/primitives";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveReport } from "../actions";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function AdminReports() {
  const admin = createAdminClient();
  const [{ data: reports }, { data: flagged }] = await Promise.all([
    admin.from("reports").select("*").order("created_at", { ascending: false }).limit(100),
    admin.from("messages").select("id, body, scam_score, created_at, conversation_id").eq("flagged", true).order("created_at", { ascending: false }).limit(50),
  ]);
  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Reports queue</h1>
        {(reports ?? []).length === 0 && <p className="text-muted">No reports.</p>}
        <div className="space-y-3">
          {(reports ?? []).map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center gap-3 p-4">
              <Pill tone={r.status === "open" ? "fair" : "default"}>{r.status}</Pill>
              <span className="font-bold">{r.target_type}</span>
              <span className="text-sm text-muted">{r.reason}{r.details ? `: ${r.details}` : ""}</span>
              <code className="text-xs text-subtle">{r.target_id}</code>
              {r.status === "open" && (
                <form action={resolveReport} className="ml-auto flex gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <Button size="sm" name="status" value="resolved" type="submit">Resolve</Button>
                  <Button size="sm" variant="ghost" name="status" value="dismissed" type="submit">Dismiss</Button>
                </form>
              )}
            </Card>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-4 text-lg font-bold">Messages flagged by scam scoring</h2>
        {(flagged ?? []).length === 0 && <p className="text-muted">Nothing flagged.</p>}
        <ul className="space-y-2">
          {(flagged ?? []).map((m) => (
            <li key={m.id} className="rounded-2xl bg-navy-900 px-4 py-3 text-sm"><Pill tone="bad">{Number(m.scam_score).toFixed(2)}</Pill> <span className="ml-2">{m.body}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
