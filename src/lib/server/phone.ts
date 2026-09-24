import "server-only";

import { createHash, randomInt } from "node:crypto";
import { env, features } from "../env";
import { formatUsPhone } from "../phone";
import type { AdminSupabase } from "../supabase/admin";
import { ApiError } from "./api";
import { sendEmail } from "./email";

type Purpose = "profile" | "dealership";

const hashCode = (id: string, code: string) => createHash("sha256").update(`${id}:${code}`).digest("hex");

async function twilio(path: string, form: Record<string, string>) {
  const auth = Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString("base64");
  const res = await fetch(`https://verify.twilio.com/v2/Services/${env.twilioVerifyServiceSid}/${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status === 429 ? 429 : 502, body.message ?? "The verification service is unavailable.");
  return body;
}

/**
 * Send a 6-digit code by SMS (Twilio Verify). Without Twilio, and only where
 * dev codes are allowed, the code is written to dev_outbox instead.
 * Rate limited to 5 sends an hour per user.
 */
export async function startPhoneVerification(admin: AdminSupabase, opts: {
  userId: string; phone: string; purpose: Purpose; dealershipId?: string;
}): Promise<{ channel: "twilio" | "dev" }> {
  const { data: allowed } = await admin.rpc("hit_rate_limit", {
    p_user: opts.userId, p_bucket: "phone_verify", p_window_seconds: 3600, p_max: 5,
  });
  if (allowed === false) throw new ApiError(429, "Too many codes requested. Try again in an hour.");

  if (features.twilio) {
    await twilio("Verifications", { To: opts.phone, Channel: "sms" });
    const { error } = await admin.from("phone_verifications").insert({
      user_id: opts.userId, phone: opts.phone, purpose: opts.purpose, dealership_id: opts.dealershipId ?? null, channel: "twilio",
    });
    if (error) throw error;
    return { channel: "twilio" };
  }
  if (!env.phoneDevCodes) throw new ApiError(503, "Phone verification isn't set up yet (TWILIO_* keys).");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { data: row, error } = await admin.from("phone_verifications").insert({
    user_id: opts.userId, phone: opts.phone, purpose: opts.purpose, dealership_id: opts.dealershipId ?? null, channel: "dev",
  }).select("id").single();
  if (error) throw error;
  await admin.from("phone_verifications").update({ code_hash: hashCode(row.id, code) }).eq("id", row.id);
  await sendEmail({
    kind: "sms_code",
    to: opts.phone,
    from: env.appName,
    subject: `SMS to ${formatUsPhone(opts.phone)}`,
    text: `Your ${env.appName} verification code is ${code}. It expires in 10 minutes.`,
    meta: { user_id: opts.userId, purpose: opts.purpose, dev_sms: true },
    devOnly: true,
  });
  return { channel: "dev" };
}

/** Check a code. On success marks the profile or dealership phone verified. */
export async function checkPhoneVerification(admin: AdminSupabase, opts: { userId: string; code: string; purpose: Purpose }) {
  const { data: v } = await admin.from("phone_verifications")
    .select("*").eq("user_id", opts.userId).eq("purpose", opts.purpose).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!v || new Date(v.expires_at) < new Date()) throw new ApiError(400, "That code expired. Send a new one.");
  if (v.attempts >= 5) throw new ApiError(429, "Too many attempts. Send a new code.");
  await admin.from("phone_verifications").update({ attempts: v.attempts + 1 }).eq("id", v.id);

  let ok = false;
  if (v.channel === "twilio") {
    const res = await twilio("VerificationCheck", { To: v.phone, Code: opts.code });
    ok = res.status === "approved";
  } else {
    ok = Boolean(v.code_hash) && v.code_hash === hashCode(v.id, opts.code.trim());
  }
  if (!ok) throw new ApiError(400, "That code doesn't match.");

  const now = new Date().toISOString();
  await admin.from("phone_verifications").update({ status: "approved", verified_at: now }).eq("id", v.id);
  if (v.purpose === "profile") {
    await admin.from("profiles").update({ phone: v.phone, phone_verified_at: now }).eq("id", opts.userId);
  } else if (v.dealership_id) {
    await admin.from("dealerships").update({ phone: v.phone, phone_verified_at: now }).eq("id", v.dealership_id);
  }
  return { phone: v.phone, verifiedAt: now, dealershipId: v.dealership_id };
}
