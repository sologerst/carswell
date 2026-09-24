"use client";

import { Bell, Download, LogOut, Pause, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Chip, Input, Label, SectionTitle } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { CATEGORIES, CRITERIA, CRITERION_BY_KEY, SOURCE_LABEL, TIER_HELP, TIER_LABEL, type Criterion } from "@/lib/criteria/catalog";
import { formatPrefValue } from "@/lib/criteria/format";
import type { Pref, Prefs, Tier, TradeIn } from "@/lib/types";
import { api, cn } from "@/lib/utils";

const TIERS: Tier[] = ["dealbreaker", "must", "nice", "dont_care"];
const TIER_DOT: Record<Tier, string> = { dealbreaker: "bg-deal-bad", must: "bg-accent", nice: "bg-drive", dont_care: "bg-subtle" };

interface ProfileInfo {
  firstName: string | null; email: string | null; phone: string | null; zip: string | null; radiusMi: number; paused: boolean; summary: string | null;
}

export function ProfileView({ profile, prefs: initialPrefs, lifeStory, vapidKey }: { profile: ProfileInfo; prefs: Prefs; lifeStory: string | null; vapidKey: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs);
  const [summary, setSummary] = useState(profile.summary);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [refine, setRefine] = useState("");
  const [busy, setBusy] = useState(false);
  const [zip, setZip] = useState(profile.zip ?? "");
  const [radius, setRadius] = useState(profile.radiusMi);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [paused, setPaused] = useState(profile.paused);

  async function patch(body: { set?: Record<string, Pref>; delete?: string[]; profile?: Record<string, unknown> }, msg = "Saved") {
    try {
      const res = await api<{ prefs: Prefs; profile: { ai_summary: string | null } }>("/api/prefs", { method: "PATCH", json: body });
      setPrefs(Object.fromEntries(Object.entries(res.prefs).filter(([k]) => !k.startsWith("_") && k !== "life_story")));
      setSummary(res.profile.ai_summary);
      toast(msg);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function sendRefine(e: React.FormEvent) {
    e.preventDefault();
    if (!refine.trim()) return;
    setBusy(true);
    try {
      const res = await api<{ reply: string; summary: string }>("/api/prefs/refine", { json: { message: refine } });
      setRefine("");
      setSummary(res.summary);
      toast(res.reply);
      router.refresh();
      const fresh = await api<{ prefs: Prefs }>("/api/prefs", { method: "PATCH", json: {} });
      setPrefs(Object.fromEntries(Object.entries(fresh.prefs).filter(([k]) => !k.startsWith("_") && k !== "life_story")));
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function enablePush() {
    if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return toast("Push isn't available here. On iPhone, install the app first.", "error");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return toast("Notifications are blocked in your browser settings.", "error");
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const pad = "=".repeat((4 - (vapidKey.length % 4)) % 4);
    const raw = atob((vapidKey + pad).replace(/-/g, "+").replace(/_/g, "/"));
    const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await api("/api/push/subscribe", { json: sub.toJSON() });
    toast("Offer and match alerts are on.", "success");
  }

  async function deleteAccount() {
    if (!confirm("Delete your account and all your data? This can't be undone.")) return;
    try {
      await api("/api/me", { method: "DELETE" });
      router.replace("/");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const byCategory = CATEGORIES.map((cat) => ({
    ...cat,
    set: Object.entries(prefs).filter(([k]) => (CRITERION_BY_KEY[k]?.category ?? (k === "body_styles_exclude" ? "car" : null)) === cat.key),
    unset: CRITERIA.filter((c) => c.category === cat.key && !prefs[c.key] && c.kind !== "calc"),
  }));
  const editingPref = editing ? prefs[editing] : null;
  const trade = (prefs.trade_in?.value as TradeIn | undefined) ?? { has: false };

  return (
    <main className="mx-auto max-w-3xl px-4 pt-safe pb-12 lg:px-8">
      <header className="flex h-16 items-center justify-between lg:h-20">
        <h1 className="text-2xl font-bold tracking-tight">{profile.firstName ? `${profile.firstName}'s profile` : "Profile"}</h1>
        <form action="/auth/signout" method="post"><Button variant="ghost" size="sm" type="submit"><LogOut /> Sign out</Button></form>
      </header>

      <Card className="bg-gradient-to-br from-navy-800 to-navy-900 p-5">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-accent-soft"><Sparkles className="size-4" /> What the AI thinks you want</p>
        <p className="mt-2 text-xl font-bold leading-snug">{summary ?? "Tell me a bit more and I'll sum it up."}</p>
        {lifeStory && <p className="mt-3 line-clamp-2 text-sm text-muted">You said: “{lifeStory}”</p>}
        <form onSubmit={sendRefine} className="mt-4 flex gap-2">
          <Input value={refine} onChange={(e) => setRefine(e.target.value)} placeholder="Refine by chat: “actually, no minivans”" aria-label="Refine your preferences" />
          <Button type="submit" size="icon" disabled={busy || !refine.trim()} aria-label="Send"><Send /></Button>
        </form>
      </Card>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
        {TIERS.map((t) => <span key={t} className="inline-flex items-center gap-1.5"><span className={cn("size-2 rounded-full", TIER_DOT[t])} />{TIER_LABEL[t]}</span>)}
      </div>

      <div className="mt-6 space-y-7">
        {byCategory.filter((c) => c.set.length || c.key === "money" || c.key === "car").map((cat) => (
          <section key={cat.key}>
            <SectionTitle>{cat.label}</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {cat.set.map(([key, p]) => (
                <button key={key} onClick={() => setEditing(key)}
                  className={cn("tap inline-flex max-w-full items-center gap-2 rounded-2xl border border-line bg-navy-850 px-3 py-1.5 text-left text-sm hover:border-navy-500 cursor-pointer", p.tier === "dont_care" && "opacity-50")}>
                  <span className={cn("size-2 shrink-0 rounded-full", TIER_DOT[p.tier])} aria-label={TIER_LABEL[p.tier]} />
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{CRITERION_BY_KEY[key]?.label ?? (key === "body_styles_exclude" ? "Body styles to skip" : key)}: {formatPrefValue(key, p.value)}</span>
                    <span className="block text-[11px] text-subtle">{SOURCE_LABEL[p.source]}</span>
                  </span>
                </button>
              ))}
              {cat.unset.length > 0 && (
                <button onClick={() => setAdding(cat.key)} className="tap inline-flex items-center gap-1 rounded-2xl border border-dashed border-line px-3 text-sm font-bold text-muted hover:text-ink cursor-pointer">
                  <Plus className="size-4" /> Add
                </button>
              )}
            </div>
          </section>
        ))}
      </div>

      <Card id="trade" className="mt-8 p-5">
        <SectionTitle>Trade-in</SectionTitle>
        <TradeEditor value={trade} onSave={(t) => patch({ set: { trade_in: { value: t, tier: prefs.trade_in?.tier ?? "must", source: "said" } } }, "Trade-in saved")} />
      </Card>

      <Card className="mt-4 p-5">
        <SectionTitle>Location</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="zip">ZIP</Label><Input id="zip" inputMode="numeric" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} /></div>
          <div><Label htmlFor="radius">Search radius: {radius} mi</Label><input id="radius" type="range" min={10} max={150} step={5} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="mt-4 w-full accent-[var(--color-accent)]" /></div>
        </div>
        <p className="mt-2 text-xs text-subtle">We use your ZIP only; GPS is never stored.</p>
        <Button size="sm" className="mt-3" onClick={() => patch({ profile: { zip, radius_mi: radius } })}>Save location</Button>
      </Card>

      <Card className="mt-4 space-y-4 p-5">
        <SectionTitle>Account</SectionTitle>
        <div>
          <Label htmlFor="phone">Phone (only shared with a dealer you match with, when you tap Share)</Label>
          <div className="flex gap-2">
            <Input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="615-555-0100" />
            <Button variant="secondary" onClick={() => patch({ profile: { phone: phone || null } })}>Save</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setPaused(!paused); patch({ profile: { paused: !paused } }, paused ? "Profile resumed" : "Profile paused"); }}>
            <Pause /> {paused ? "Resume profile" : "Pause profile"}
          </Button>
          {vapidKey && <Button variant="secondary" size="sm" onClick={enablePush}><Bell /> Offer alerts</Button>}
          <Button variant="secondary" size="sm" asChild><a href="/api/me" download><Download /> Export my data</a></Button>
          <Button variant="danger" size="sm" onClick={deleteAccount}><Trash2 /> Delete account</Button>
        </div>
        <p className="text-xs text-subtle">
          {profile.email} · <Link className="underline" href="/legal/privacy">Privacy</Link> · <Link className="underline" href="/legal/privacy#do-not-sell">Do not sell or share my info</Link> · <Link className="underline" href="/legal/terms">Terms</Link>
        </p>
      </Card>

      <Sheet open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)} title={editing ? CRITERION_BY_KEY[editing]?.label ?? editing : ""} description={editing ? `Source: ${SOURCE_LABEL[editingPref?.source ?? "said"]}` : undefined}>
        {editing && editingPref && (
          <PrefEditor
            criterion={CRITERION_BY_KEY[editing]}
            prefKey={editing}
            pref={editingPref}
            onSave={(p) => { setEditing(null); patch({ set: { [editing]: { ...p, source: "said" } } }); }}
            onDelete={() => { const k = editing; setEditing(null); patch({ delete: [k] }, "Removed"); }}
          />
        )}
      </Sheet>

      <Sheet open={Boolean(adding)} onOpenChange={(o) => !o && setAdding(null)} title={`Add: ${CATEGORIES.find((c) => c.key === adding)?.label ?? ""}`}>
        <div className="flex flex-wrap gap-2">
          {byCategory.find((c) => c.key === adding)?.unset.map((c) => (
            <Chip key={c.key} onClick={() => { setAdding(null); setPrefs((p) => ({ ...p, [c.key]: { value: defaultValue(c), tier: c.type === "D" ? "dealbreaker" : c.type === "H" ? "must" : "nice", source: "said" } })); setEditing(c.key); }}>{c.label}</Chip>
          ))}
        </div>
      </Sheet>
    </main>
  );
}

function defaultValue(c: Criterion): unknown {
  if (c.kind === "bool") return true;
  if (c.kind === "multi") return [];
  if (c.kind === "range") return { min: 2019 };
  if (c.kind === "trade") return { has: true };
  if (c.kind === "enum") return c.options?.[0]?.value ?? "";
  if (c.kind === "number" || c.kind === "money") return 0;
  return "";
}

function PrefEditor({ criterion, prefKey, pref, onSave, onDelete }: { criterion?: Criterion; prefKey: string; pref: Pref; onSave: (p: Pref) => void; onDelete: () => void }) {
  const [tier, setTier] = useState<Tier>(pref.tier);
  const [value, setValue] = useState<unknown>(pref.value);
  const kind = criterion?.kind ?? (Array.isArray(pref.value) ? "multi" : typeof pref.value === "boolean" ? "bool" : "text");
  const options = criterion?.options ?? (prefKey === "body_styles_exclude" ? CRITERION_BY_KEY.body_styles.options : undefined);

  return (
    <div className="space-y-6">
      <div>
        <Label>How much does it matter?</Label>
        <div className="grid gap-2">
          {TIERS.map((t) => (
            <button key={t} onClick={() => setTier(t)} className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3 text-left cursor-pointer", tier === t ? "border-accent bg-accent/10" : "border-line bg-navy-850")}>
              <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", TIER_DOT[t])} />
              <span><span className="block font-bold">{TIER_LABEL[t]}</span><span className="block text-xs text-muted">{TIER_HELP[t]}</span></span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Value</Label>
        {kind === "multi" && options ? (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => {
              const arr = (value as string[]) ?? [];
              const on = arr.includes(o.value);
              return <Chip key={o.value} selected={on} onClick={() => setValue(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}>{o.label}</Chip>;
            })}
          </div>
        ) : kind === "enum" && options ? (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => <Chip key={o.value} selected={String(value) === o.value} onClick={() => setValue(prefKey === "loan_term" ? Number(o.value) : o.value)}>{o.label}</Chip>)}
          </div>
        ) : kind === "bool" ? (
          <div className="flex gap-2"><Chip selected={value === true} onClick={() => setValue(true)}>Yes</Chip><Chip selected={value === false} onClick={() => setValue(false)}>No</Chip></div>
        ) : kind === "number" || kind === "money" ? (
          <Input type="number" inputMode="numeric" value={String(value ?? "")} onChange={(e) => setValue(Number(e.target.value))} />
        ) : kind === "range" ? (
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" placeholder="From year" value={String((value as { min?: number })?.min ?? "")} onChange={(e) => setValue({ ...(value as object), min: Number(e.target.value) || undefined })} />
            <Input type="number" placeholder="To year" value={String((value as { max?: number })?.max ?? "")} onChange={(e) => setValue({ ...(value as object), max: Number(e.target.value) || undefined })} />
          </div>
        ) : kind === "trade" ? (
          <p className="text-sm text-muted">Edit your trade-in in the Trade-in card below.</p>
        ) : (
          <Input value={String(value ?? "")} onChange={(e) => setValue(e.target.value)} />
        )}
      </div>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => onSave({ value, tier, source: pref.source })}>Save</Button>
        <Button variant="danger" onClick={onDelete}><Trash2 /> Remove</Button>
      </div>
    </div>
  );
}

function TradeEditor({ value, onSave }: { value: TradeIn; onSave: (t: TradeIn) => void }) {
  const [t, setT] = useState<TradeIn>(value);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Chip selected={t.has} onClick={() => setT({ ...t, has: true })}>Trading in</Chip>
        <Chip selected={!t.has} onClick={() => setT({ has: false })}>No trade</Chip>
      </div>
      {t.has && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label htmlFor="tdesc">Car</Label><Input id="tdesc" value={t.description ?? ""} onChange={(e) => setT({ ...t, description: e.target.value })} placeholder="2016 Honda Civic" /></div>
          <div><Label htmlFor="tval">Value</Label><Input id="tval" inputMode="numeric" value={t.value ?? ""} onChange={(e) => setT({ ...t, value: Number(e.target.value.replace(/\D/g, "")) || undefined })} placeholder="12000" /></div>
          <div><Label htmlFor="tpay">Payoff owed</Label><Input id="tpay" inputMode="numeric" value={t.payoff ?? ""} onChange={(e) => setT({ ...t, payoff: Number(e.target.value.replace(/\D/g, "")) || undefined })} placeholder="4000" /></div>
        </div>
      )}
      <p className="text-xs text-subtle">Your estimate; dealers make the real trade offer. Tennessee taxes the price minus your trade value.</p>
      <Button size="sm" onClick={() => onSave(t)}>Save trade-in</Button>
    </div>
  );
}
