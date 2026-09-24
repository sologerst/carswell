"use client";

import { AlertTriangle, Check, ImagePlus, Loader2, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PhoneVerify } from "@/components/phone/phone-verify";
import { VinScanner } from "@/components/sell/vin-scanner";
import { Button } from "@/components/ui/button";
import { Card, Chip, DealBadge, Input, Label, Pill, SectionTitle, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { FEATURES, featureLabel } from "@/lib/criteria/features";
import { dealBand } from "@/lib/deal";
import { usd } from "@/lib/format";
import { normalizeBody, normalizeDrive, normalizeFuel } from "@/lib/inventory/normalize";
import { createClient } from "@/lib/supabase/client";
import { BODY_STYLES, type BodyStyle } from "@/lib/types";
import { api, cn, uuid } from "@/lib/utils";
import { isValidVin } from "@/lib/vin";

export interface WizardDraft {
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim_level: string | null;
  miles: number;
  body_style: BodyStyle;
  exterior_color: string | null;
  price: number;
  description: string | null;
  features: string[];
  title_status: string | null;
  accident_count: number | null;
  owner_count: number | null;
  expected_price: number | null;
  photos: { id: string; url: string; issues: string[] }[];
}

type Step = "vin" | "photos" | "details" | "price" | "verify" | "publish";
const STEPS: { key: Step; label: string }[] = [
  { key: "vin", label: "VIN" },
  { key: "photos", label: "Photos" },
  { key: "details", label: "Details" },
  { key: "price", label: "Price" },
  { key: "verify", label: "Verify" },
  { key: "publish", label: "Publish" },
];

interface SnapResponse {
  snap: { description: string; features: string[]; exterior_color: string | null; damage_notes: { photo: number; note: string }[]; photo_feedback: { photo: number; issue: string }[]; missing_shots: string[]; source: "ai" | "template" };
  price: { quick: number; low: number; high: number; expected: number; comps: number; basis: string | null } | null;
  photoIssues: { photo: number; issues: string[] }[];
  recalls: number;
}

type PublishResult = { status: "approved" | "pending" | "rejected" | "needs_fix"; flags: { code: string; severity: string; detail: string }[] };

/** Resize a photo in the browser before upload (keeps uploads small on cellular). */
async function resizeForUpload(file: File, max = 2000): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo."))), "image/jpeg", 0.86));
}

export function SellWizard({ userId, zip, verifiedPhone, profilePhone, draft: initialDraft, minPhotos, maxPhotos }: {
  userId: string;
  zip: string | null;
  verifiedPhone: string | null;
  profilePhone: string | null;
  draft: WizardDraft | null;
  minPhotos: number;
  maxPhotos: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<WizardDraft | null>(initialDraft);
  const [phone, setPhone] = useState(verifiedPhone);
  const [step, setStep] = useState<Step>(() => {
    if (!initialDraft) return "vin";
    if (initialDraft.photos.length < minPhotos) return "photos";
    if (!initialDraft.description) return "details";
    return "price";
  });
  const [busy, setBusy] = useState(false);

  // Step 1: VIN + basics.
  const [vin, setVin] = useState("");
  const [decode, setDecode] = useState<Record<string, string> | null>(null);
  const [basics, setBasics] = useState({ year: "", make: "", model: "", trim: "", miles: "", body: "" as BodyStyle | "", color: "", zip: zip ?? "" });

  // Step 3/4.
  const [notes, setNotes] = useState("");
  const [snap, setSnap] = useState<SnapResponse | null>(null);
  const [description, setDescription] = useState(initialDraft?.description ?? "");
  const [features, setFeatures] = useState<string[]>(initialDraft?.features ?? []);
  const [titleStatus, setTitleStatus] = useState(initialDraft?.title_status ?? "clean");
  const [accidents, setAccidents] = useState(initialDraft?.accident_count === null || initialDraft?.accident_count === undefined ? "" : String(initialDraft.accident_count));
  const [owners, setOwners] = useState(initialDraft?.owner_count ? String(initialDraft.owner_count) : "");
  const [price, setPrice] = useState(initialDraft ? String(Math.round(initialDraft.price)) : "");
  const [agree, setAgree] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  async function lookupVin(v: string) {
    const clean = v.trim().toUpperCase();
    setVin(clean);
    if (!isValidVin(clean)) return;
    try {
      const res = await api<{ decode: Record<string, string> | null }>(`/api/vin/${clean}`);
      setDecode(res.decode);
      const d = res.decode ?? {};
      setBasics((b) => ({
        ...b,
        year: d["Model Year"] ?? b.year,
        make: d.Make ? d.Make.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : b.make,
        model: d.Model ?? b.model,
        trim: d.Trim ?? b.trim,
        body: (normalizeBody(d["Body Class"], d.Seats ? Number(d.Seats) : null) ?? b.body) as BodyStyle | "",
      }));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function createListing() {
    setBusy(true);
    try {
      const d = decode ?? {};
      const { id } = await api<{ id: string }>("/api/sell/listings", {
        json: {
          vin, year: Number(basics.year), make: basics.make, model: basics.model, trim: basics.trim || null,
          miles: Number(basics.miles.replace(/\D/g, "")), body_style: basics.body, zip: basics.zip,
          exterior_color: basics.color || null,
          fuel_type: normalizeFuel(d["Fuel Type - Primary"]),
          drivetrain: normalizeDrive(d["Drive Type"]),
          transmission: /manual/i.test(d["Transmission Style"] ?? "") ? "manual" : /cvt|continuously/i.test(d["Transmission Style"] ?? "") ? "cvt" : d["Transmission Style"] ? "automatic" : null,
        },
      });
      setDraft({
        id, vin, year: Number(basics.year), make: basics.make, model: basics.model, trim_level: basics.trim || null,
        miles: Number(basics.miles.replace(/\D/g, "")), body_style: basics.body as BodyStyle, exterior_color: basics.color || null,
        price: 0, description: null, features: [], title_status: "clean", accident_count: null, owner_count: null, expected_price: null, photos: [],
      });
      window.history.replaceState(null, "", `/sell/new?draft=${id}`);
      setStep("photos");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function addPhotos(files: FileList) {
    if (!draft) return;
    const room = maxPhotos - draft.photos.length;
    const list = [...files].slice(0, room);
    if (!list.length) return toast(`Up to ${maxPhotos} photos.`, "error");
    setUploading(list.length);
    const supabase = createClient();
    const paths: string[] = [];
    try {
      for (const file of list) {
        const blob = await resizeForUpload(file);
        const path = `${userId}/${draft.id}/${uuid()}.jpg`;
        const { error } = await supabase.storage.from("listing-photos").upload(path, blob, { contentType: "image/jpeg" });
        if (error) throw new Error(error.message);
        paths.push(path);
        setUploading((n) => n - 1);
      }
      const { photos } = await api<{ photos: { id: string; url: string; quality: { issues: string[] } }[] }>(`/api/sell/listings/${draft.id}/photos`, { json: { paths } });
      setDraft({ ...draft, photos: [...draft.photos, ...photos.map((p) => ({ id: p.id, url: p.url, issues: p.quality.issues }))] });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setUploading(0);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removePhoto(photoId: string) {
    if (!draft) return;
    try {
      await api(`/api/sell/listings/${draft.id}/photos?photo=${photoId}`, { method: "DELETE" });
      setDraft({ ...draft, photos: draft.photos.filter((p) => p.id !== photoId) });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function runSnap() {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await api<SnapResponse>(`/api/sell/listings/${draft.id}/snap`, { json: { notes } });
      setSnap(res);
      setDescription(res.snap.description);
      setFeatures((f) => [...new Set([...f, ...res.snap.features])]);
      if (res.price && !price) setPrice(String(res.price.low));
      if (res.price) setDraft({ ...draft, expected_price: res.price.expected });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails(next: Step) {
    if (!draft) return;
    setBusy(true);
    try {
      await api(`/api/sell/listings/${draft.id}`, {
        method: "PATCH",
        json: {
          description, features, title_status: titleStatus,
          accident_count: accidents === "" ? null : Number(accidents),
          owner_count: owners === "" ? null : Number(owners),
          ...(next === "verify" || next === "publish" ? { price: Number(price.replace(/\D/g, "")) } : {}),
        },
      });
      setDraft({ ...draft, description, features });
      setStep(next);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await api<PublishResult>(`/api/sell/listings/${draft.id}/publish`, { json: {} });
      setResult(res);
      if (res.status === "approved") toast("Your car is live.", "success");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const expected = draft?.expected_price ?? snap?.price?.expected ?? null;
  const priceNum = Number(price.replace(/\D/g, "")) || 0;
  const band = priceNum ? dealBand(priceNum, expected) : null;
  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const title = draft ? `${draft.year} ${draft.make} ${draft.model}${draft.trim_level ? ` ${draft.trim_level}` : ""}` : null;

  if (result) return <PublishOutcome result={result} listingId={draft!.id} onFix={(s) => { setResult(null); setStep(s); }} />;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <ol className="flex gap-1" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex-1">
            <div className={cn("h-1.5 rounded-full", i <= stepIndex ? "bg-accent" : "bg-navy-800")} />
            <p className={cn("mt-1 text-[11px] font-bold", i === stepIndex ? "text-ink" : "text-subtle")} aria-current={i === stepIndex ? "step" : undefined}>{s.label}</p>
          </li>
        ))}
      </ol>
      {title && <p className="text-sm text-muted">{title} · VIN {draft!.vin}</p>}

      {step === "vin" && (
        <Card className="space-y-4 p-5">
          <div>
            <h1 className="text-2xl font-bold">What are you selling?</h1>
            <p className="text-muted">Start with the VIN. It&apos;s on the driver-side dashboard, the door jamb sticker, your title and your insurance card.</p>
          </div>
          <VinScanner onVin={lookupVin} />
          <div>
            <Label htmlFor="vin">VIN</Label>
            <Input id="vin" value={vin} maxLength={17} autoCapitalize="characters" spellCheck={false}
              onChange={(e) => lookupVin(e.target.value)} placeholder="17 characters" className="font-mono tracking-wider" />
            {vin.length === 17 && !isValidVin(vin) && <p className="mt-1 text-sm text-deal-bad">That VIN doesn&apos;t pass the check-digit test. Check for typos.</p>}
          </div>
          {isValidVin(vin) && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="year">Year</Label><Input id="year" inputMode="numeric" value={basics.year} onChange={(e) => setBasics({ ...basics, year: e.target.value.replace(/\D/g, "") })} /></div>
              <div><Label htmlFor="make">Make</Label><Input id="make" value={basics.make} onChange={(e) => setBasics({ ...basics, make: e.target.value })} /></div>
              <div><Label htmlFor="model">Model</Label><Input id="model" value={basics.model} onChange={(e) => setBasics({ ...basics, model: e.target.value })} /></div>
              <div><Label htmlFor="trim">Trim</Label><Input id="trim" value={basics.trim} onChange={(e) => setBasics({ ...basics, trim: e.target.value })} /></div>
              <div><Label htmlFor="miles">Odometer (miles)</Label><Input id="miles" inputMode="numeric" value={basics.miles} onChange={(e) => setBasics({ ...basics, miles: e.target.value.replace(/[^\d,]/g, "") })} /></div>
              <div><Label htmlFor="color">Exterior color</Label><Input id="color" value={basics.color} onChange={(e) => setBasics({ ...basics, color: e.target.value })} placeholder="e.g. Blue" /></div>
              <div><Label htmlFor="zip">ZIP where the car is</Label><Input id="zip" inputMode="numeric" maxLength={5} value={basics.zip} onChange={(e) => setBasics({ ...basics, zip: e.target.value.replace(/\D/g, "") })} /></div>
              <div className="col-span-2">
                <Label>Body style</Label>
                <div className="flex flex-wrap gap-2">
                  {BODY_STYLES.map((b) => <Chip key={b.key} selected={basics.body === b.key} onClick={() => setBasics({ ...basics, body: b.key })}>{b.label}</Chip>)}
                </div>
              </div>
            </div>
          )}
          <Button size="lg" className="w-full" onClick={createListing}
            disabled={busy || !isValidVin(vin) || !basics.year || !basics.make || !basics.model || !basics.miles || !basics.body || basics.zip.length !== 5}>
            {busy ? <Loader2 className="animate-spin" /> : null} Continue
          </Button>
        </Card>
      )}

      {step === "photos" && draft && (
        <Card className="space-y-4 p-5">
          <div>
            <h1 className="text-2xl font-bold">Add photos</h1>
            <p className="text-muted">At least {minPhotos}. Daylight, clean car, whole car in frame. Front and rear three-quarter, both sides, dashboard, seats, odometer and tires sell cars.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {draft.photos.map((p, i) => (
              <figure key={p.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Photo ${i + 1}`} className="aspect-square w-full rounded-2xl object-cover" />
                <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => removePhoto(p.id)}
                  className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-black/60 cursor-pointer"><Trash2 className="size-4" /></button>
                {p.issues.length > 0 && <figcaption className="absolute inset-x-1.5 bottom-1.5 rounded-lg bg-black/70 px-2 py-0.5 text-[10px] font-bold text-deal-fair">{p.issues.join(", ")}</figcaption>}
              </figure>
            ))}
            {draft.photos.length < maxPhotos && (
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading > 0}
                className="grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-line text-muted hover:border-accent cursor-pointer">
                {uploading > 0 ? <span className="flex flex-col items-center gap-1 text-xs"><Loader2 className="animate-spin" /> {uploading} left</span> : <span className="flex flex-col items-center gap-1 text-xs font-bold"><ImagePlus /> Add</span>}
              </button>
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" aria-label="Add photos"
            onChange={(e) => e.target.files && addPhotos(e.target.files)} />
          <p className="text-xs text-subtle">By uploading you confirm you took these photos and license them to CarSwipe to show your listing.</p>
          <Button size="lg" className="w-full" onClick={() => setStep("details")} disabled={draft.photos.length < minPhotos || uploading > 0}>Continue</Button>
        </Card>
      )}

      {step === "details" && draft && (
        <Card className="space-y-4 p-5">
          <div>
            <h1 className="text-2xl font-bold">Describe it</h1>
            <p className="text-muted">Tell us anything buyers should know, then let AI draft the listing from your photos. You edit everything before it goes live.</p>
          </div>
          <div>
            <Label htmlFor="notes">Your notes</Label>
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="New tires in March, one owner, always garaged, small scratch on the rear bumper." />
          </div>
          <Button variant="secondary" onClick={runSnap} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Write my listing</Button>

          {snap && (
            <div className="space-y-3 rounded-2xl bg-navy-850 p-4 text-sm">
              <p className="flex items-center gap-2 font-bold text-accent-soft"><Sparkles className="size-4" /> {snap.snap.source === "ai" ? "Drafted from your photos (AI). Check it." : "Drafted from your VIN and notes."}</p>
              {snap.snap.damage_notes.length > 0 && (
                <div>
                  <p className="font-bold">We noticed</p>
                  <ul className="list-disc pl-5 text-muted">{snap.snap.damage_notes.map((d) => <li key={d.note}>Photo {d.photo}: {d.note}</li>)}</ul>
                  <p className="text-xs text-subtle">Mentioning wear up front builds trust and avoids surprises at the meet-up.</p>
                </div>
              )}
              {[...snap.snap.photo_feedback.map((f) => `Photo ${f.photo}: ${f.issue}`), ...snap.photoIssues.map((p) => `Photo ${p.photo}: ${p.issues.join(", ")}`)].length > 0 && (
                <div>
                  <p className="font-bold">Photo tips</p>
                  <ul className="list-disc pl-5 text-muted">
                    {snap.snap.photo_feedback.map((f) => <li key={`f${f.photo}${f.issue}`}>Photo {f.photo}: {f.issue}</li>)}
                    {snap.photoIssues.map((p) => <li key={`q${p.photo}`}>Photo {p.photo}: {p.issues.join(", ")}</li>)}
                  </ul>
                </div>
              )}
              {snap.snap.missing_shots.length > 0 && <p className="text-muted"><span className="font-bold text-ink">Missing shots:</span> {snap.snap.missing_shots.join(", ")}</p>}
              {snap.recalls > 0 && <p className="text-deal-fair">NHTSA lists {snap.recalls} recall campaign{snap.recalls === 1 ? "" : "s"} for this model. Mention whether they were done.</p>}
            </div>
          )}

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
            <p className="mt-1 text-xs text-subtle">Phone numbers, emails and links are removed. Buyers message you in the app.</p>
          </div>
          <div>
            <Label>Features</Label>
            <div className="flex flex-wrap gap-2">
              {[...new Set([...features, ...FEATURES.slice(0, 18).map((f) => f.key)])].map((k) => (
                <Chip key={k} selected={features.includes(k)} onClick={() => setFeatures((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]))}>{featureLabel(k)}</Chip>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="title_status">Title</Label>
              <select id="title_status" value={titleStatus} onChange={(e) => setTitleStatus(e.target.value)} className="h-12 w-full rounded-2xl border border-line bg-navy-850 px-3">
                <option value="clean">Clean</option><option value="rebuilt">Rebuilt</option><option value="salvage">Salvage</option><option value="lemon">Lemon buyback</option>
              </select>
            </div>
            <div><Label htmlFor="accidents">Accidents</Label><Input id="accidents" inputMode="numeric" value={accidents} onChange={(e) => setAccidents(e.target.value.replace(/\D/g, ""))} placeholder="0" /></div>
            <div><Label htmlFor="owners">Owners</Label><Input id="owners" inputMode="numeric" value={owners} onChange={(e) => setOwners(e.target.value.replace(/\D/g, ""))} placeholder="1" /></div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep("photos")}>Back</Button>
            <Button size="lg" className="flex-1" onClick={() => saveDetails("price")} disabled={busy || description.trim().length < 20}>Continue</Button>
          </div>
        </Card>
      )}

      {step === "price" && draft && (
        <Card className="space-y-4 p-5">
          <div>
            <h1 className="text-2xl font-bold">Set your price</h1>
            <p className="text-muted">Buyers see a deal rating next to your price, based on similar cars nearby.</p>
          </div>
          {snap?.price || expected ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              {snap?.price ? (
                <>
                  <PriceTile label="Quick sale" value={snap.price.quick} onPick={(v) => setPrice(String(v))} />
                  <PriceTile label="Fair range low" value={snap.price.low} onPick={(v) => setPrice(String(v))} />
                  <PriceTile label="Fair range high" value={snap.price.high} onPick={(v) => setPrice(String(v))} />
                </>
              ) : <p className="col-span-3 text-sm text-muted">Similar cars list around {usd(expected)}.</p>}
            </div>
          ) : <p className="text-sm text-muted">Not enough similar cars nearby to suggest a price. Check a few comparable listings.</p>}
          {snap?.price && <p className="text-xs text-subtle">From {snap.price.comps} comparable listings ({snap.price.basis === "trim" ? "same trim" : "same model"}). An estimate, not an appraisal.</p>}
          <div>
            <Label htmlFor="price">Asking price</Label>
            <Input id="price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
            <div className="mt-2 flex items-center gap-2 text-sm">{band && <><span className="text-muted">Buyers will see:</span><DealBadge rating={band} /></>}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep("details")}>Back</Button>
            <Button size="lg" className="flex-1" onClick={() => saveDetails(phone ? "publish" : "verify")} disabled={busy || priceNum < 500}>Continue</Button>
          </div>
        </Card>
      )}

      {step === "verify" && draft && (
        <Card className="space-y-4 p-5">
          <div>
            <h1 className="text-2xl font-bold">Verify your phone</h1>
            <p className="text-muted">Every private seller verifies a phone number. It&apos;s never shown to buyers unless you share it in chat.</p>
          </div>
          <PhoneVerify purpose="profile" initialPhone={profilePhone} verifiedPhone={phone} onVerified={(p) => setPhone(p)} />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep("price")}>Back</Button>
            <Button size="lg" className="flex-1" onClick={() => setStep("publish")} disabled={!phone}>Continue</Button>
          </div>
        </Card>
      )}

      {step === "publish" && draft && (
        <Card className="space-y-4 p-5">
          <h1 className="text-2xl font-bold">Review and publish</h1>
          <div className="flex gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {draft.photos[0] && <img src={draft.photos[0].url} alt="" className="h-24 w-32 rounded-2xl object-cover" />}
            <div>
              <p className="font-bold">{title}</p>
              <p className="text-2xl font-bold">{usd(priceNum)}</p>
              <p className="text-sm text-muted">{draft.photos.length} photos · {draft.miles.toLocaleString("en-US")} miles</p>
            </div>
          </div>
          <p className="line-clamp-4 text-sm text-muted">{description}</p>
          <label className="flex items-start gap-3 rounded-2xl bg-navy-850 p-4 text-sm">
            <input type="checkbox" className="mt-1 size-5 accent-[var(--color-accent)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I own this car and the title is in my name (or I have the lender&apos;s payoff details). The description is accurate. I&apos;m not selling cars as a business (curbstoning is prohibited).</span>
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep("price")}>Back</Button>
            <Button size="lg" className="flex-1" onClick={publish} disabled={busy || !agree}>{busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Publish</Button>
          </div>
          <p className="text-xs text-subtle">Every listing is checked for known scam patterns (copied photos, VINs listed elsewhere, payment scams) before it goes live.</p>
        </Card>
      )}
    </div>
  );
}

function PriceTile({ label, value, onPick }: { label: string; value: number; onPick: (v: number) => void }) {
  return (
    <button type="button" onClick={() => onPick(value)} className="rounded-2xl border border-line bg-navy-850 px-2 py-3 hover:border-accent cursor-pointer">
      <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">{label}</p>
      <p className="text-lg font-bold">{usd(value)}</p>
    </button>
  );
}

const FIX_STEP: Record<string, Step> = { phone_unverified: "verify", too_few_photos: "photos", vin_invalid: "vin" };

function PublishOutcome({ result, listingId, onFix }: { result: PublishResult; listingId: string; onFix: (s: Step) => void }) {
  const tone = { approved: "good", pending: "fair", rejected: "bad", needs_fix: "fair" } as const;
  const heading = {
    approved: "Your car is live",
    pending: "In review",
    rejected: "We can't publish this listing",
    needs_fix: "One more thing",
  }[result.status];
  const body = {
    approved: "Buyers nearby will start seeing it in their decks. Likes arrive in your seller inbox, and you have 72 hours to reply with a price.",
    pending: "Our team checks a few listings by hand. Most reviews finish within a day; we'll notify you.",
    rejected: "It matches patterns we block to protect buyers. If you think this is a mistake, contact support from your profile.",
    needs_fix: "Fix the item below, then publish again.",
  }[result.status];
  const fixStep = result.flags.map((f) => FIX_STEP[f.code]).find(Boolean);
  return (
    <Card className="mx-auto max-w-2xl space-y-4 p-6 text-center">
      <Pill tone={tone[result.status]} className="mx-auto">{result.status === "approved" ? <Check className="size-3.5" /> : <AlertTriangle className="size-3.5" />} {result.status.replace("_", " ")}</Pill>
      <h1 className="text-2xl font-bold">{heading}</h1>
      <p className="text-muted">{body}</p>
      {result.flags.length > 0 && result.status !== "approved" && (
        <ul className="space-y-2 text-left text-sm">
          {result.flags.map((f) => <li key={f.code} className="rounded-2xl bg-navy-850 px-4 py-3"><SectionTitle className="mb-1">{f.code.replace(/_/g, " ")}</SectionTitle>{f.detail}</li>)}
        </ul>
      )}
      <div className="flex justify-center gap-2">
        {result.status === "needs_fix" && fixStep && <Button onClick={() => onFix(fixStep)}>Fix it</Button>}
        <Button variant={result.status === "needs_fix" ? "secondary" : "primary"} asChild><Link href={`/sell/listings/${listingId}`}>View listing</Link></Button>
      </div>
    </Card>
  );
}
