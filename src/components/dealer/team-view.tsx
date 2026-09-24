"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, Pill, SectionTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { relativeTime } from "@/lib/format";
import { api } from "@/lib/utils";

export function TeamView({ members, invites, isOwner, meId }: {
  members: { id: string; name: string; email: string | null; role: string; since: string }[];
  invites: { id: string; email: string; role: string; expires_at: string; accepted_at: string | null }[];
  isOwner: boolean;
  meId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "owner">("staff");
  const [busy, setBusy] = useState(false);

  async function call(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      await api("/api/dealer/team", { json: body });
      toast(done, "success");
      setEmail("");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team</h1>
        <p className="text-sm text-muted">Everyone here sees the lead inbox and can send offers. Owners manage billing and the team.</p>
      </div>
      <Card className="divide-y divide-line">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="font-bold">{m.name}{m.id === meId ? " (you)" : ""}</p>
              <p className="truncate text-sm text-muted">{m.email} · joined {relativeTime(m.since)}</p>
            </div>
            <Pill tone={m.role === "owner" ? "accent" : "default"}>{m.role}</Pill>
            {isOwner && m.id !== meId && <Button size="sm" variant="ghost" disabled={busy} onClick={() => call({ action: "remove", userId: m.id }, "Removed.")}>Remove</Button>}
          </div>
        ))}
      </Card>
      {isOwner && (
        <Card className="space-y-3 p-5">
          <SectionTitle>Invite a teammate</SectionTitle>
          <form className="grid gap-3 sm:grid-cols-[1fr_140px_auto]" onSubmit={(e) => { e.preventDefault(); call({ action: "invite", email, role }, `Invite sent to ${email}.`); }}>
            <div><Label htmlFor="invite-email" className="sr-only">Email</Label><Input id="invite-email" type="email" required placeholder="sam@yourdealer.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as "staff" | "owner")} className="h-12 rounded-2xl border border-line bg-navy-850 px-3">
              <option value="staff">Staff</option><option value="owner">Owner</option>
            </select>
            <Button type="submit" size="lg" disabled={busy || !email}>Invite</Button>
          </form>
          {invites.filter((i) => !i.accepted_at).length > 0 && (
            <ul className="space-y-1 text-sm text-muted">
              {invites.filter((i) => !i.accepted_at).map((i) => <li key={i.id}>{i.email} · {i.role} · {new Date(i.expires_at) < new Date() ? "expired" : `expires ${new Date(i.expires_at).toLocaleDateString("en-US")}`}</li>)}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
