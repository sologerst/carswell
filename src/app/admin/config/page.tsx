import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, Textarea } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { saveConfig } from "../actions";

export const metadata: Metadata = { title: "Config" };
export const dynamic = "force-dynamic";

/** app_config editor: ranking weights, limits, tax rates... change without a deploy. */
export default async function AdminConfig() {
  const supabase = await createClient();
  const { data } = await supabase.from("app_config").select("key, value, description, updated_at").order("key");
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Config</h1>
      <p className="mb-6 text-sm text-muted">Every change is written to the audit log. Values are JSON.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {(data ?? []).map((row) => (
          <Card key={row.key} className="p-4">
            <form action={saveConfig}>
              <input type="hidden" name="key" value={row.key} />
              <p className="font-mono text-sm font-bold">{row.key}</p>
              <p className="mb-2 text-xs text-muted">{row.description}</p>
              <Textarea name="value" rows={Math.min(18, JSON.stringify(row.value, null, 2).split("\n").length + 1)} defaultValue={JSON.stringify(row.value, null, 2)} className="font-mono text-xs" spellCheck={false} />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-subtle">Updated {new Date(row.updated_at).toLocaleString("en-US")}</span>
                <Button size="sm" type="submit">Save</Button>
              </div>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}
