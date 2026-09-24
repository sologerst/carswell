import * as Sentry from "@sentry/nextjs";
import { scrubEvent, sentryOptions } from "./lib/sentry-scrub";

/** Error monitoring (Sentry) when SENTRY_DSN is set; otherwise a no-op. */
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({ dsn, ...sentryOptions, beforeSend: (event) => scrubEvent(event) });
  }
}

export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (!process.env.SENTRY_DSN) return;
  return Sentry.captureRequestError(...args);
};
