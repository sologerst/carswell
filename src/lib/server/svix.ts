import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Svix-signed webhook (Resend uses Svix). Signed content is
 * `${id}.${timestamp}.${body}` with HMAC-SHA256 over the base64 secret after
 * the "whsec_" prefix. Rejects timestamps more than 5 minutes off.
 */
export function verifySvix(secret: string, headers: Headers, body: string, now = Date.now()): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
