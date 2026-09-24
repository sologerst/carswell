import * as Sentry from "@sentry/nextjs";
import { scrubEvent, sentryOptions } from "./lib/sentry-scrub";

// Browser error monitoring when NEXT_PUBLIC_SENTRY_DSN is set. No session
// replay: the buyer app shows personal budgets and chats.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({ dsn, ...sentryOptions, beforeSend: (event) => scrubEvent(event) });
}

export const onRouterTransitionStart = dsn ? Sentry.captureRouterTransitionStart : () => {};
