"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TasteCheck } from "@/components/onboarding/taste-check";
import { Button } from "@/components/ui/button";
import { Chip, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { SLOT_BY_ID, type SlotId } from "@/lib/onboarding/slots";
import { api } from "@/lib/utils";

const ORDER: SlotId[] = ["budget", "location", "condition", "body", "seats", "fuel", "history", "trade", "timeline", "taste"];

/** The no-AI onboarding: the same 10 questions, one per screen. */
export function OnboardingForm({ initialZip }: { initialZip: string }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({ radius: "40", zip: initialZip });
  const [busy, setBusy] = useState(false);
  const id = ORDER[step];
  const slot = SLOT_BY_ID[id];

  const set = (k: string, v: string | string[]) => setAnswers((a) => ({ ...a, [k]: v }));
  const next = () => setStep((s) => Math.min(ORDER.length - 1, s + 1));
  const ready = id === "location" ? /^\d{5}$/.test(String(answers.zip ?? "")) : id === "taste" ? true : Boolean(answers[id]?.length);

  async function submit(taste: { chosen: string[]; rejected: string[] }) {
    setBusy(true);
    try {
      await api("/api/onboarding/form", {
        json: {
          budget: answers.budget, zip: answers.zip, radius: Number(answers.radius ?? 40), condition: answers.condition,
          body: answers.body, seats: answers.seats, fuel: (answers.fuel as string[]).filter((f) => f !== "any"),
          history: answers.history, trade: answers.trade, timeline: answers.timeline, taste,
        },
      });
      router.replace("/deck");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 pt-safe pb-safe">
      <div className="flex h-14 items-center justify-between">
        {step > 0 ? (
          <button onClick={() => setStep(step - 1)} className="tap -ml-2 inline-flex items-center gap-1 px-2 text-sm font-bold text-muted cursor-pointer"><ArrowLeft className="size-4" /> Back</button>
        ) : <Link href="/onboarding" className="tap -ml-2 inline-flex items-center px-2 text-sm font-bold text-muted">Chat instead</Link>}
        <span className="text-sm font-bold text-subtle">{step + 1} / {ORDER.length}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-navy-800"><div className="brand-gradient h-full transition-all" style={{ width: `${((step + 1) / ORDER.length) * 100}%` }} /></div>

      <h1 className="mt-10 text-2xl font-bold tracking-tight">{slot.question}</h1>
      <div className="mt-6 flex-1">
        {id === "location" && (
          <div className="mb-6">
            <Input inputMode="numeric" maxLength={5} placeholder="ZIP code" value={String(answers.zip ?? "")} onChange={(e) => set("zip", e.target.value.replace(/\D/g, ""))} aria-label="ZIP code" />
          </div>
        )}
        {id === "taste" ? (
          <TasteCheck onDone={submit} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {slot.chips.map((c) => {
              const key = id === "location" ? "radius" : id;
              const current = answers[key];
              const selected = Array.isArray(current) ? current.includes(c.value) : current === c.value;
              return (
                <Chip key={c.value} selected={selected} className={c.body ? "h-auto flex-col gap-1 rounded-2xl py-2" : ""}
                  onClick={() => {
                    if (slot.multi) {
                      const arr = Array.isArray(current) ? current : [];
                      set(key, selected ? arr.filter((x) => x !== c.value) : [...arr, c.value]);
                    } else set(key, c.value);
                  }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.body && <img src={`/fx/car/${c.body}/9d8cff/4?label=0`} alt="" className="h-12 w-20 rounded-lg object-cover" />}
                  {c.label}
                </Chip>
              );
            })}
          </div>
        )}
      </div>
      {id !== "taste" && (
        <Button size="lg" className="my-6 w-full" disabled={!ready || busy} onClick={next}>Continue</Button>
      )}
    </main>
  );
}
