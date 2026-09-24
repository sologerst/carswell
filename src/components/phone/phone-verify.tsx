"use client";

import { CheckCircle2, Smartphone } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatUsPhone } from "@/lib/phone";
import { api } from "@/lib/utils";

/** Send a code by SMS, then check it. Calls onVerified with the E.164 number. */
export function PhoneVerify({ purpose, dealershipId, initialPhone, verifiedPhone, onVerified }: {
  purpose: "profile" | "dealership";
  dealershipId?: string;
  initialPhone?: string | null;
  verifiedPhone?: string | null;
  onVerified?: (phone: string) => void;
}) {
  const toast = useToast();
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<null | "twilio" | "dev">(null);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(verifiedPhone ?? null);

  async function send() {
    setBusy(true);
    try {
      const res = await api<{ channel: "twilio" | "dev" }>("/api/phone", { json: { action: "start", phone, purpose, dealershipId } });
      setSent(res.channel);
      toast("Code sent.");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    try {
      const res = await api<{ phone: string }>("/api/phone", { json: { action: "check", code, purpose } });
      setVerified(res.phone);
      onVerified?.(res.phone);
      toast("Phone verified.", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (verified) {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-deal-good/10 px-4 py-3 text-sm font-bold text-deal-good">
        <CheckCircle2 className="size-5" /> {formatUsPhone(verified)} verified
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor={`phone-${purpose}`}>Mobile number</Label>
        <div className="flex gap-2">
          <Input id={`phone-${purpose}`} type="tel" inputMode="tel" autoComplete="tel" placeholder="(615) 555-0142"
            value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button type="button" variant="secondary" onClick={send} disabled={busy || phone.replace(/\D/g, "").length < 10}>
            <Smartphone /> {sent ? "Resend" : "Send code"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-subtle">We text a one-time code. SMS is used only for verification codes.</p>
      </div>
      {sent && (
        <div>
          <Label htmlFor={`code-${purpose}`}>6-digit code</Label>
          <div className="flex gap-2">
            <Input id={`code-${purpose}`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <Button type="button" onClick={check} disabled={busy || code.length !== 6}>Verify</Button>
          </div>
          {sent === "dev" && <p className="mt-1 text-xs text-deal-fair">Dev mode: no SMS provider is set, so the code is in Admin → Outbox.</p>}
        </div>
      )}
    </div>
  );
}
