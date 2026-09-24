// Shared Sentry privacy settings: no default PII, and strip anything that
// looks like an email or phone number from error messages and breadcrumbs.

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

export function scrubText(s: string): string {
  return s.replace(EMAIL, "[email]").replace(PHONE, "[phone]");
}

interface EventLike {
  message?: string;
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string }[];
  request?: { cookies?: unknown; headers?: Record<string, string>; data?: unknown };
  user?: unknown;
}

export function scrubEvent<T extends EventLike>(event: T): T {
  if (event.message) event.message = scrubText(event.message);
  for (const v of event.exception?.values ?? []) if (v.value) v.value = scrubText(v.value);
  for (const b of event.breadcrumbs ?? []) if (b.message) b.message = scrubText(b.message);
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) {
      delete event.request.headers.cookie;
      delete event.request.headers.authorization;
    }
  }
  delete event.user;
  return event;
}

export const sentryOptions = {
  sendDefaultPii: false,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
};
