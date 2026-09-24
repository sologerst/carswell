// Server-side environment. Every paid service is optional: when its key is
// missing the app falls back (fixtures, templates, dev_outbox, hidden push).

import "server-only";

const read = (name: string) => {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
};

export const env = {
  siteUrl: read("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000",
  appName: read("NEXT_PUBLIC_APP_NAME") ?? "CarSwipe",
  launchMarketZip: read("LAUNCH_MARKET_ZIP") ?? "37203",

  supabaseUrl: read("NEXT_PUBLIC_SUPABASE_URL") ?? "http://127.0.0.1:54321",
  supabasePublishableKey: read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? "",
  supabaseSecretKey: read("SUPABASE_SECRET_KEY"),

  anthropicApiKey: read("ANTHROPIC_API_KEY"),
  aiModelFrontier: read("AI_MODEL_FRONTIER") ?? "claude-opus-5",
  aiModelFast: read("AI_MODEL_FAST") ?? "claude-haiku-4-5",
  aiDailyBudgetPerUser: Number(read("AI_DAILY_BUDGET_PER_USER") ?? "0") || undefined,

  inventorySources: (read("INVENTORY_SOURCES") ?? "fixtures").split(",").map((s) => s.trim()),
  marketcheckApiKey: read("MARKETCHECK_API_KEY"),
  marketcheckApiBase: read("MARKETCHECK_API_BASE") ?? "https://mc-api.marketcheck.com/v2",
  marketcheckMaxRps: Number(read("MARKETCHECK_MAX_RPS") ?? "5"),
  marketcheckMonthlyCallBudget: Number(read("MARKETCHECK_MONTHLY_CALL_BUDGET") ?? "0"),
  nhtsaVpicBase: read("NHTSA_VPIC_BASE") ?? "https://vpic.nhtsa.dot.gov/api/vehicles",
  nhtsaApiBase: read("NHTSA_API_BASE") ?? "https://api.nhtsa.gov",

  resendApiKey: read("RESEND_API_KEY"),
  emailFrom: read("EMAIL_FROM") ?? "CarSwipe <hello@carswipe.local>",
  leadsFrom: read("LEADS_FROM") ?? "CarSwipe Leads <leads@carswipe.local>",
  relayEmailDomain: read("RELAY_EMAIL_DOMAIN") ?? "relay.carswipe.local",
  resendWebhookSecret: read("RESEND_WEBHOOK_SECRET"),

  vapidPublicKey: read("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
  vapidPrivateKey: read("VAPID_PRIVATE_KEY"),
  vapidSubject: read("VAPID_SUBJECT") ?? "mailto:hello@carswipe.local",

  twilioAccountSid: read("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: read("TWILIO_AUTH_TOKEN"),
  twilioVerifyServiceSid: read("TWILIO_VERIFY_SERVICE_SID"),

  cronSecret: read("CRON_SECRET"),
  adminBootstrapEmails: (read("ADMIN_BOOTSTRAP_EMAILS") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  sentryDsn: read("SENTRY_DSN"),
};

export const features = {
  ai: Boolean(env.anthropicApiKey),
  email: Boolean(env.resendApiKey),
  push: Boolean(env.vapidPublicKey && env.vapidPrivateKey),
  marketcheck: Boolean(env.marketcheckApiKey) && env.inventorySources.includes("marketcheck"),
  twilio: Boolean(env.twilioAccountSid && env.twilioAuthToken && env.twilioVerifyServiceSid),
  adminClient: Boolean(env.supabaseSecretKey),
};
