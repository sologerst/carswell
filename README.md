# CarSwipe

An AI car buyer in your pocket. Buyers tell the AI about their life, swipe on nearby cars, and read a plain-English brief on every car. When they like one, local dealers answer with a real out-the-door price. Built as an installable PWA (phone-first buyer app, desktop-first dealer inbox and admin).

This repo implements the MVP from the *CarSwipe Platform Build Specification*: phases 0-3 are complete and runnable with **zero paid keys** (300 synthetic Nashville cars), and phase 4-5 plumbing (MarketCheck ingest, ADF lead emails, relay replies, dealer inbox) is in place behind env-gated integrations.

## What's here

| Area | Status |
| --- | --- |
| **Buyer app** | Welcome, email-code login, conversational onboarding (Claude or rule-based fallback) + 10-screen form fallback, taste check, swipe deck (drag / keys / buttons, undo, offline queue), car detail with AI Car Brief, Likes, side-by-side out-the-door offers, chat, profile with "What the AI thinks you want" editable chips |
| **Ranking** | SQL hard filters (tiers, reliable-data gating, radius via PostGIS, budget via TN out-the-door math) + soft score with the 0→50-swipe weight ramp, exploration (15% → 8%), diversity, match reasons, empty-deck rescue, progressive profiling, visual taste vectors (pgvector) |
| **AI layer** | Onboarding extraction, Car Brief (source-cited, unsourced claims dropped), negotiator drafts (human approves every message), dealer lead summary, profile summary, inbound offer parsing. Per-user daily budget, template fallback for each |
| **Dealers** | Lead inbox (New / Offered / Matched / Expired) with buyer dossier, reply timer and AI summary; send-offer form with auto TN tax; contact unlocks only after the buyer picks your offer; ADF email leads with relay reply-to and claim links for off-platform dealers |
| **Admin** | Funnel + kill-criteria dashboard, dealer verification and lead-email curation, `app_config` editor (audited), dev email outbox with a dealer-reply simulator, reports queue, jobs and ingest monitor, audit log |
| **PWA** | Manifest, icons, service worker (offline shell, cached car photos), offline swipe queue with idempotent replay, Web Push (VAPID), install prompts incl. iOS |
| **Data** | 10 Supabase migrations, Row Level Security on every table, `record_swipes` (the only write path for swipes), realtime chat over private Broadcast channels |
| **Tests** | 60 Vitest unit tests, 18 pgTAP database tests, 12 Playwright E2E tests on Pixel 7 and iPhone 15 profiles (incl. offline swipes, off-platform dealer email reply, axe accessibility) |

Deferred by the spec: Stripe billing, dealer CSV feeds, demand-intelligence dashboard (Phase 2); private sellers and finance/insurance partners (Phase 3). Sentry is listed in the env file but not yet wired.

## Run it locally (about 10 minutes)

Requires Node 20.9+ and Docker.

```bash
npm install
cp .env.example .env.local
npm run seed          # starts local Supabase (Docker), applies migrations, loads 300 cars + demo accounts
npx supabase status   # copy the Publishable key and Secret key into .env.local
npm run dev           # http://localhost:3000
```

With `NEXT_PUBLIC_DEMO_LOGIN=true`, the login page offers one-tap demo accounts (password `carswipe-demo`, local only):

| Account | What you'll see |
| --- | --- |
| `buyer@carswipe.dev` | Onboarded buyer with three likes: one new lead, one offer to compare, one matched chat |
| `dealer@carswipe.dev` | Music City Motors (Demo) lead inbox |
| `admin@carswipe.dev` | Admin console |

New sign-ups use a 6-digit email code. Locally the email lands in Mailpit at http://127.0.0.1:54324.

### Turning on real services (one key at a time)

| Key | Without it | With it |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Rule-based onboarding extraction, template briefs and drafts | Claude (`AI_MODEL_FRONTIER`, default `claude-opus-5`; `AI_MODEL_FAST`, default `claude-haiku-4-5`) with server-side refusal fallback and a per-user daily budget |
| `RESEND_API_KEY` | Emails are written to `dev_outbox` (Admin → Outbox) | Lead emails send; set `RESEND_WEBHOOK_SECRET` + inbound routing for relay replies |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Push is hidden | Offer and lead alerts (`npx web-push generate-vapid-keys`) |
| `MARKETCHECK_API_KEY` + `INVENTORY_SOURCES=fixtures,marketcheck` | 300 fixture cars | Live Nashville inventory via the ingest cron (field mapping marked `[VERIFY with MarketCheck]`) |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run seed` | Start local Supabase and reset it with migrations + `supabase/seed.sql` |
| `npm run fixtures` | Regenerate `supabase/seed.sql` (deterministic) |
| `npm test` | Vitest unit tests |
| `npx supabase test db` | pgTAP database tests (run on a fresh seed) |
| `npm run test:e2e` | Playwright on Pixel 7 + iPhone 15 (reseed first: tests change data) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:types` | Regenerate `src/lib/supabase/database.types.ts` |

## Deploy (Vercel Pro + Supabase)

1. **Supabase project** (staging and prod): `npx supabase link --project-ref <ref>` then `npx supabase db push`. Load reference data (ZIPs, markets, `app_config`) from the top of `supabase/seed.sql`. **Never load the full seed into a hosted project**: it creates demo accounts with a published password, including an admin.
2. **Auth**: enable the Email provider. In *Auth → Email Templates → Magic Link*, use `supabase/templates/otp_code.html` so emails carry the 6-digit `{{ .Token }}` (magic links open Safari from an installed iPhone app). Configure custom SMTP (Resend) because the built-in sender is heavily rate-limited. Add your site URL and `https://<domain>/auth/callback` to redirect URLs.
3. **Vercel**: import the repo, set the env vars from `.env.example` (never set `NEXT_PUBLIC_DEMO_LOGIN` in production), set `CRON_SECRET`. `vercel.json` schedules the jobs (ingest and enrich every 10 min, dispatch every 5 min, maintenance hourly, stats daily). Each branch gets a preview URL.

## Project layout

```
src/app/(buyer)        deck, likes, offers, chat, profile, car detail (bottom tabs / desktop rail)
src/app/dealer         lead inbox, lead detail + send offer, chat, settings
src/app/admin          overview, dealers, config, outbox, reports, jobs, audit
src/app/api            deck, swipes, events, brief, onboarding, agent/draft, vin, messages, prefs, push, webhooks, cron
src/lib/deck           filters (pass 1), ranking (pass 2), rescue, progressive profiling
src/lib/ai             Claude client with budget + fallbacks; onboarding, brief, negotiator, summaries
src/lib/server         server services (deck, leads/ADF dispatch, inbound email, ingest, enrich, email, push)
src/lib/money.ts       TN tax, out-the-door, payments, cost to own
supabase/migrations    schema, RLS, functions
scripts/fixtures       synthetic Nashville inventory generator
```

## Open items from the spec

- `[VERIFY]` Tennessee tax/fee rates (in `app_config.tax_tn`), MarketCheck field names and license terms, Resend inbound payload shape, rideshare-eligible model years.
- `[SET]` Kill-criteria targets, APR assumptions, doc fee default, questions-per-swipes pacing: all editable in Admin → Config.
- Image-embedding provider: visual taste currently uses 16-dimension style fingerprints (fixtures and `attribute-style-v1` for real listings); swap in photo embeddings in `src/lib/server/enrich.ts`.
- Final product name (`NEXT_PUBLIC_APP_NAME`) and counsel review of `/legal/*` drafts.
