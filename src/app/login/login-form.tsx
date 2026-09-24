"use client";

import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";

const DEMO = [
  { email: "buyer@carswipe.dev", label: "Demo buyer", hint: "Onboarded, with likes and an offer" },
  { email: "dealer@carswipe.dev", label: "Demo dealer", hint: "Music City Motors lead inbox" },
  { email: "admin@carswipe.dev", label: "Admin", hint: "Config, dealers, outbox" },
];

/**
 * Email one-time code login. Codes work inside an installed iPhone app, where
 * magic links would open Safari instead.
 */
export function LoginForm({ next, demo, oauth }: { next: string | null; demo: boolean; oauth: { google: boolean; apple: boolean } }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = () => {
    router.replace(next ?? "/deck");
    router.refresh();
  };

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) setError(error.message);
    else setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError(error.message === "Token has expired or is invalid" ? "That code didn't work. Check it or send a new one." : error.message);
    else done();
  }

  async function demoLogin(demoEmail: string) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: demoEmail, password: "carswipe-demo" });
    setBusy(false);
    if (error) setError(`Demo login failed: ${error.message}. Did you run npm run seed?`);
    else {
      router.replace(demoEmail.startsWith("dealer") ? "/dealer" : demoEmail.startsWith("admin") ? "/admin" : next ?? "/deck");
      router.refresh();
    }
  }

  async function oauthLogin(provider: "google" | "apple") {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next ?? "/deck")}` },
    });
  }

  return (
    <div>
      <Link href="/" className="tap -ml-3 mb-6 inline-flex items-center gap-1 rounded-full px-3 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">{step === "email" ? "Sign in or sign up" : "Check your email"}</h1>
      <p className="mt-2 text-muted">
        {step === "email" ? "We'll email you a 6-digit code. No password needed." : `Enter the 6-digit code we sent to ${email}.`}
      </p>

      {step === "email" ? (
        <form onSubmit={sendCode} className="mt-8 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={busy || !email.includes("@")}>
            <Mail /> {busy ? "Sending…" : "Email me a code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-8 space-y-4">
          <div>
            <Label htmlFor="code">Code</Label>
            <Input
              id="code" autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="text-center text-2xl tracking-[0.5em]" placeholder="••••••"
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={busy || code.length < 6}>{busy ? "Checking…" : "Continue"}</Button>
          <button type="button" className="tap w-full text-sm font-bold text-muted hover:text-ink" onClick={() => { setStep("email"); setCode(""); }}>
            Use a different email
          </button>
        </form>
      )}

      {error && <p role="alert" className="mt-4 rounded-2xl bg-deal-bad/15 px-4 py-3 text-sm font-bold text-deal-bad">{error}</p>}

      {(oauth.google || oauth.apple) && step === "email" && (
        <div className="mt-8 space-y-3">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-subtle">or</p>
          {oauth.google && <Button variant="outline" className="w-full" onClick={() => oauthLogin("google")}>Continue with Google</Button>}
          {oauth.apple && <Button variant="outline" className="w-full" onClick={() => oauthLogin("apple")}>Continue with Apple</Button>}
        </div>
      )}

      {demo && step === "email" && (
        <div className="mt-10 rounded-3xl border border-dashed border-line p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-subtle">Local demo accounts</p>
          <div className="grid gap-2">
            {DEMO.map((d) => (
              <button key={d.email} onClick={() => demoLogin(d.email)} disabled={busy} className="tap flex items-center justify-between rounded-2xl bg-navy-850 px-4 py-2 text-left hover:bg-navy-800 cursor-pointer">
                <span>
                  <span className="block font-bold">{d.label}</span>
                  <span className="block text-xs text-muted">{d.hint}</span>
                </span>
                <span className="text-xs text-subtle">{d.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
