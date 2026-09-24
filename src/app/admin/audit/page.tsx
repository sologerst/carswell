import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

export default async function AdminAudit() {
  const { data } = await createAdminClient().from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(200);
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Audit log</h1>
      <div className="overflow-x-auto rounded-3xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-navy-900 text-left text-xs text-subtle"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Details</th></tr></thead>
          <tbody className="divide-y divide-line">
            {(data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-4 py-2 text-muted">{new Date(r.created_at).toLocaleString("en-US")}</td>
                <td className="px-4 py-2 font-bold">{r.action}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.target}</td>
                <td className="max-w-md truncate px-4 py-2 font-mono text-xs text-subtle">{JSON.stringify(r.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
