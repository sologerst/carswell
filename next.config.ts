import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

// Sentry wraps the build only when a DSN is set; source maps upload only
// with SENTRY_AUTH_TOKEN (+ SENTRY_ORG / SENTRY_PROJECT).
const sentryOn = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

export default sentryOn
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      telemetry: false,
      sourcemaps: { disable: process.env.SENTRY_AUTH_TOKEN ? false : true },
    })
  : nextConfig;
