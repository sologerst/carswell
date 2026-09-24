"use client";

import { CheckCircle2, Circle, FileText, Loader2, Share2, Trash2, Upload, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { TestDrivePicker } from "@/components/deck/test-drive-picker";
import { Button } from "@/components/ui/button";
import { Chip, Input, Label, Pill } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { relativeTime, usd } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { api, cn, uuid } from "@/lib/utils";

/** A checklist row persisted on the interest (set_journey_item). */
export function CheckItem({ interestId, itemKey, done, children }: { interestId: string; itemKey: string; done: boolean; children: React.ReactNode }) {
  const [on, setOn] = useState(done);
  const toast = useToast();
  async function toggle() {
    const next = !on;
    setOn(next);
    const { error } = await createClient().rpc("set_journey_item", { p_interest_id: interestId, p_key: itemKey, p_done: next });
    if (error) { setOn(!next); toast(error.message, "error"); }
  }
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={toggle} className="flex w-full items-start gap-3 rounded-2xl px-2 py-2 text-left hover:bg-navy-850 cursor-pointer">
      {on ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-deal-good" /> : <Circle className="mt-0.5 size-5 shrink-0 text-subtle" />}
      <span className={cn("text-sm", on && "text-muted line-through")}>{children}</span>
    </button>
  );
}

export interface ShopOption { id: string; name: string; address: string | null; city: string | null; price: number | null; rating: number | null; mobile: boolean; distance: number | null; demo: boolean }

export function InspectionBooker({ interestId, shops, existing }: {
  interestId: string;
  shops: ShopOption[];
  existing: { shop: string; status: string; windows: { day: string; time: string }[] } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [shop, setShop] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  if (existing) {
    return <p className="rounded-2xl bg-navy-850 px-4 py-3 text-sm"><span className="font-bold">{existing.shop}</span> · {existing.status} · {existing.windows.map((w) => `${w.day} ${w.time}`).join(" or ")}</p>;
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {shops.slice(0, 4).map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setShop(s.id)} aria-pressed={shop === s.id}
              className={cn("flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm cursor-pointer", shop === s.id ? "border-accent bg-accent/10" : "border-line hover:border-navy-500")}>
              <Wrench className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{s.name}{s.demo && <span className="font-normal text-subtle"> (demo)</span>}</span>
                <span className="block truncate text-muted">{[s.address, s.city].filter(Boolean).join(", ")}{s.distance !== null ? ` · ${s.distance.toFixed(1)} mi` : ""}{s.mobile ? " · comes to you" : ""}</span>
              </span>
              {s.price !== null && <span className="font-bold">{usd(s.price)}</span>}
            </button>
          </li>
        ))}
      </ul>
      <Button disabled={!shop} onClick={() => setPicker(true)}>Pick times</Button>
      <TestDrivePicker open={picker} onOpenChange={setPicker} title="Inspection"
        onConfirm={async (windows) => {
          setPicker(false);
          try {
            await api("/api/inspections", { json: { interestId, shopId: shop, windows } });
            toast("Inspection requested. The shop will confirm a time.", "success");
            router.refresh();
          } catch (e) {
            toast((e as Error).message, "error");
          }
        }} />
    </div>
  );
}

interface PrequalResult { status: string; maxAmount: number | null; apr: number | null; termMonths: number; monthly: number | null; reference: string; disclosure: string; sample: boolean }

export function PrequalCard({ amount: initialAmount, creditTier, latest }: {
  amount: number;
  creditTier: string;
  latest: { status: string; max_amount: number | null; apr: number | null; term_months: number | null; created_at: string } | null;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState(String(Math.round(initialAmount)));
  const [term, setTerm] = useState("72");
  const [tier, setTier] = useState(creditTier);
  const [income, setIncome] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PrequalResult | null>(null);

  async function run() {
    setBusy(true);
    try {
      setResult(await api<PrequalResult>("/api/finance/prequal", {
        json: { amount: Number(amount), termMonths: Number(term), creditTier: tier, annualIncome: income ? Number(income.replace(/\D/g, "")) : null, consent: true },
      }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const shown = result ?? (latest ? { status: latest.status, maxAmount: latest.max_amount, apr: latest.apr, termMonths: latest.term_months ?? 72, monthly: null, reference: "", disclosure: "", sample: true } : null);
  return (
    <div className="space-y-3">
      {shown && (
        <div className="rounded-2xl bg-navy-850 p-4 text-sm" role="status">
          {shown.status === "prequalified"
            ? <p><span className="font-bold text-deal-good">Pre-qualified</span> up to {usd(shown.maxAmount)} at {shown.apr}% APR for {shown.termMonths} months{shown.monthly ? ` (about ${usd(shown.monthly)}/mo)` : ""}.</p>
            : <p><span className="font-bold text-deal-fair">Not pre-qualified</span> for that amount. Try a lower amount or a larger down payment.</p>}
          {latest && !result && <p className="mt-1 text-xs text-subtle">Checked {relativeTime(latest.created_at)}</p>}
          {shown.sample && <p className="mt-2 text-xs text-subtle">{result?.disclosure || "Sample result from the demo lender. Not a credit decision."}</p>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="pq-amount">Amount to finance</Label><Input id="pq-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} /></div>
        <div><Label htmlFor="pq-term">Term (months)</Label><Input id="pq-term" inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value.replace(/\D/g, ""))} /></div>
        <div><Label htmlFor="pq-income">Yearly income (optional)</Label><Input id="pq-income" inputMode="numeric" value={income} onChange={(e) => setIncome(e.target.value.replace(/\D/g, ""))} /></div>
        <div>
          <Label htmlFor="pq-tier">Credit</Label>
          <select id="pq-tier" value={tier} onChange={(e) => setTier(e.target.value)} className="h-12 w-full rounded-2xl border border-line bg-navy-850 px-3">
            <option value="excellent">Excellent (720+)</option><option value="good">Good (660-719)</option><option value="fair">Fair (600-659)</option><option value="rebuilding">Rebuilding</option>
          </select>
        </div>
      </div>
      <label className="flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-accent)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        Share these numbers with the lending partner for a soft check. It doesn&apos;t affect your credit score, and we never ask for your SSN.
      </label>
      <Button onClick={run} disabled={busy || !consent || Number(amount) < 1000}>{busy ? <Loader2 className="animate-spin" /> : null} Check my rate</Button>
    </div>
  );
}

export function InsuranceCard({ listingId, latest }: { listingId: string; latest: { carrier: string | null; monthly_premium: number; coverage: Record<string, string> } | null }) {
  const toast = useToast();
  const [coverage, setCoverage] = useState<"full" | "liability">("full");
  const [quote, setQuote] = useState(latest ? { carrier: latest.carrier ?? "", monthlyPremium: latest.monthly_premium, coverage: latest.coverage, sample: true } : null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      setQuote(await api("/api/insurance/quote", { json: { listingId, coverage } }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Chip selected={coverage === "full"} onClick={() => setCoverage("full")}>Full coverage</Chip>
        <Chip selected={coverage === "liability"} onClick={() => setCoverage("liability")}>Liability only</Chip>
      </div>
      {quote && (
        <div className="rounded-2xl bg-navy-850 p-4 text-sm" role="status">
          <p><span className="text-2xl font-bold">{usd(quote.monthlyPremium)}</span><span className="text-muted">/mo · {quote.carrier}</span></p>
          <p className="mt-1 text-muted">{Object.entries(quote.coverage).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}</p>
          {quote.sample && <p className="mt-1 text-xs text-subtle">Sample quote from the demo partner. A lender will require full coverage on a financed car.</p>}
        </div>
      )}
      <Button variant="secondary" onClick={run} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} Get a quote</Button>
    </div>
  );
}

export interface VaultDoc { id: string; kind: string; file_name: string; storage_path: string; created_at: string }
const KINDS: [string, string][] = [
  ["license", "Driver's license"], ["insurance", "Insurance card"], ["income", "Proof of income"], ["preapproval", "Loan pre-approval"],
  ["trade_title", "Trade-in title"], ["payoff", "Payoff letter"], ["other", "Other"],
];

/** Upload vault: private storage under the buyer's folder; share into a matched chat as a 7-day link. */
export function VaultCard({ userId, interestId, conversationId, docs, needed }: {
  userId: string; interestId: string; conversationId: string | null; docs: VaultDoc[]; needed: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState(needed[0] ?? "license");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (file.size > 15 * 1024 * 1024) return toast("Files up to 15 MB.", "error");
    setBusy(true);
    try {
      const supabase = createClient();
      const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
      const path = `${userId}/${uuid()}-${safe}`;
      const { error } = await supabase.storage.from("vault").upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (error) throw new Error(error.message);
      const { error: rowErr } = await supabase.from("vault_documents").insert({
        user_id: userId, interest_id: interestId, kind: kind as "license", storage_path: path, file_name: file.name.slice(0, 200), mime: file.type, size_bytes: file.size,
      });
      if (rowErr) throw new Error(rowErr.message);
      toast("Saved to your vault.", "success");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function open(doc: VaultDoc) {
    const { data, error } = await createClient().storage.from("vault").createSignedUrl(doc.storage_path, 60);
    if (error || !data) return toast("Couldn't open that file.", "error");
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function remove(doc: VaultDoc) {
    const supabase = createClient();
    await supabase.storage.from("vault").remove([doc.storage_path]);
    const { error } = await supabase.from("vault_documents").delete().eq("id", doc.id);
    if (error) return toast(error.message, "error");
    router.refresh();
  }

  async function share(doc: VaultDoc) {
    if (!conversationId) return;
    try {
      await api("/api/vault/share", { json: { documentId: doc.id, conversationId } });
      toast("Shared in chat (link works for 7 days).", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="space-y-3">
      {docs.length > 0 && (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-2xl bg-navy-850 px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted" />
              <button type="button" onClick={() => open(d)} className="min-w-0 flex-1 truncate text-left font-bold hover:underline cursor-pointer">{KINDS.find(([k]) => k === d.kind)?.[1]}: <span className="font-normal text-muted">{d.file_name}</span></button>
              {conversationId && <Button size="sm" variant="ghost" onClick={() => share(d)} aria-label={`Share ${d.file_name} in chat`}><Share2 /></Button>}
              <Button size="sm" variant="ghost" onClick={() => remove(d)} aria-label={`Delete ${d.file_name}`}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="vault-kind">Document</Label>
          <select id="vault-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="h-11 rounded-2xl border border-line bg-navy-850 px-3 text-sm">
            {KINDS.map(([k, label]) => <option key={k} value={k}>{label}{needed.includes(k) && !docs.some((d) => d.kind === k) ? " (needed)" : ""}</option>)}
          </select>
        </div>
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload</Button>
        <input ref={input} type="file" accept="image/*,application/pdf" className="sr-only" aria-label="Upload a document" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      </div>
      <p className="text-xs text-subtle">Private to you. Files are shared only when you tap share, as a link that expires in 7 days.</p>
    </div>
  );
}

export function BoughtButtons({ interestId, price, status, privateSale }: { interestId: string; price: number | null; status: string; privateSale: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [stars, setStars] = useState(0);
  async function bought() {
    const { error } = await createClient().rpc("mark_purchased", { p_interest_id: interestId, p_price: price ?? undefined });
    if (error) return toast(error.message, "error");
    toast("Congrats on the new car!", "success");
    router.refresh();
  }
  async function review(n: number) {
    setStars(n);
    const { error } = await createClient().rpc("review_seller", { p_interest_id: interestId, p_stars: n, p_comment: "" });
    toast(error ? error.message : "Thanks for the review.");
  }
  if (status === "purchased") {
    return (
      <div className="space-y-2">
        <Pill tone="good"><CheckCircle2 className="size-3.5" /> Bought</Pill>
        {!privateSale && (
          <p className="flex items-center gap-1 text-sm text-muted">Rate the dealer:
            {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} stars`} onClick={() => review(n)} className={cn("tap grid place-items-center text-lg cursor-pointer", n <= stars ? "text-deal-fair" : "text-subtle")}>★</button>)}
          </p>
        )}
      </div>
    );
  }
  return <Button onClick={bought}>I bought it</Button>;
}
