# CarSwipe

An AI car buyer in your pocket. Buyers tell the AI about their life, swipe on nearby cars, and read a plain-English brief on every car. When they like one, local dealers answer with a real out-the-door price. Built as an installable PWA (phone-first buyer app, desktop-first dealer inbox and admin).

This repo implements the *CarSwipe Platform Build Specification*: the MVP (phases 0-6), **Phase 2** (full dealer portal, Stripe billing, demand intelligence, negotiator v2) and **Phase 3** (private sellers with VIN scan, snap-to-list, moderation and phone verification; finance and insurance partners; fraud checks). Everything runs locally with **zero paid keys** (300 synthetic Nashville cars, a private seller and a synthetic buyer panel); each paid service switches on with its env key.

## What's here

| Area | Status |
| --- | --- |
| **Buyer app** | Welcome, email-code login, conversational onboarding (Claude or rule-based fallback) + 10-screen form fallback, taste check, swipe deck (drag / keys / buttons, undo, offline queue), car detail with AI Car Brief, Likes, side-by-side out-the-door offers with financing terms, counteroffers, chat, profile with "What the AI thinks you want" editable chips |
| **Match to keys** | Per-car journey: test-drive times with "Add to calendar" (.ics), at-home test drives, pre-purchase inspection booking (private sales), soft-pull pre-qualification and insurance quotes (demo partners), trade-in estimator (market model + AI photo notes), document checklist with a private upload vault shared into chat as 7-day links, Tennessee title steps, private-sale bill of sale, "Did you buy it?" prompts at 14 and 30 days |
| **Ranking** | SQL hard filters (tiers, reliable-data gating, radius via PostGIS, budget via TN out-the-door math) + soft score with the 0→50-swipe weight ramp, exploration (15% → 8%), diversity, match reasons, empty-deck rescue, progressive profiling, visual taste vectors (pgvector), capped and labeled promoted cards. **p95 ≈ 120 ms at 50,000 listings** |
| **AI layer** | Onboarding extraction, Car Brief (source-cited), negotiator drafts and **v2 counteroffers** (sourced reasons, human approves every message), dealer lead summary, profile summary, inbound offer parsing, **snap-to-list** (listing copy, features, damage and photo notes from seller photos), VIN photo reading, trade-in photo notes. Per-user daily budget and a template fallback for each |
| **Private sellers** | `/sell`: VIN scan (camera barcode, photo, or typed; NHTSA decode), photo upload with quality checks, snap-to-list, price suggestion from the market model, phone verification (Twilio Verify or dev codes), **moderation** that blocks known scam patterns (payment-scam text, copied photos by perceptual hash, a VIN listed at a dealer), holds bait prices and VIN mismatches for review, and caps private sales per year; seller inbox with 72 h reply window, prices and counteroffers, chat with safety tips, bill of sale |
| **Dealer portal** | Self-serve signup with phone verification and admin verification, team invites, lead inbox with dossier, reply timer, AI summary and counteroffers; send-offer form with auto TN tax and financing terms; **inventory** with 30-day funnel (seen, opened, liked, passed, like rate, leads), price edits, promotions; **CSV feeds** (upload or daily URL pull, VIN-decoded gaps, canonical-per-VIN); **demand insights** (why cars get passed, price tolerance, local demand you don't stock; k-anonymous); **billing** |
| **Billing** | Stripe Checkout for the metered matched-lead plan (Billing Meters, one charge per matched lead, never per sale) and the insights subscription, one-time promotion payments, customer portal, idempotent webhooks; dev entitlement without keys |
| **Admin** | Funnel + kill-criteria dashboard, dealer verification (releases feed inventory), moderation queue, billing and Stripe events, market demand charts, `app_config` editor (audited), dev outbox with a dealer-reply simulator, reports, jobs, audit log |
| **PWA** | Manifest, icons, service worker (offline shell, cached car photos), offline swipe queue with idempotent replay (synced from any buyer page), Web Push (VAPID), install prompts incl. iOS |
| **Data** | 13 Supabase migrations, Row Level Security on every table, private storage buckets per user folder, `record_swipes` (the only write path for swipes), realtime chat over private Broadcast channels |
| **Ops** | Sentry (env-gated, PII scrubbed, no replay), Vercel crons incl. nightly insights and dealer feeds, Lighthouse CI, 50k-listing performance test |
| **Tests** | 81 Vitest unit tests, 50 pgTAP database tests, 21 Playwright E2E tests, each run on Pixel 7 and iPhone 15 profiles (offline swipes, off-platform dealer email, private listing + fraud block, counteroffer, CSV feed, match to keys, axe accessibility) |

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
| `buyer@carswipe.dev` | Onboarded buyer with three likes: one new lead, one offer to compare (try **Counteroffer**), one matched chat (try **Next steps**) |
| `dealer@carswipe.dev` | Music City Motors (Demo): leads, inventory funnel, demand insights, billing (dev entitlement), a promoted car |
| `seller@carswipe.dev` | Sam, a private seller: two live cars, one held for review, a buyer waiting for a price |
| `admin@carswipe.dev` | Admin console: moderation queue, market demand, billing |

The seed also creates a 60-person synthetic buyer panel (no logins) with 30 days of swipes, so listing funnels and k-anonymous demand insights have data.

New sign-ups use a 6-digit email code. Locally the email lands in Mailpit at http://127.0.0.1:54324.

### Turning on real services (one key at a time)

| Key | Without it | With it |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Rule-based onboarding extraction, template briefs and drafts | Claude (`AI_MODEL_FRONTIER`, default `claude-opus-5`; `AI_MODEL_FAST`, default `claude-haiku-4-5`) with server-side refusal fallback and a per-user daily budget |
| `RESEND_API_KEY` | Emails are written to `dev_outbox` (Admin → Outbox) | Lead emails send; set `RESEND_WEBHOOK_SECRET` + inbound routing for relay replies |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Push is hidden | Offer and lead alerts (`npx web-push generate-vapid-keys`) |
| `MARKETCHECK_API_KEY` + `INVENTORY_SOURCES=fixtures,marketcheck` | 300 fixture cars | Live Nashville inventory via the ingest cron (field mapping marked `[VERIFY with MarketCheck]`) |
| `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`) | Dev entitlement: insights and promotions unlocked, matched-lead charges listed as unbilled | Checkout, metered matched leads on invoices (Billing Meters), insights plan, promotions, portal. Setup notes in `.env.example` |
| `TWILIO_*` | Verification codes land in Admin → Outbox (dev and `PHONE_DEV_CODES=true` only) | SMS codes via Twilio Verify for sellers and dealerships |
| `FINANCE_PARTNER` / `INSURANCE_PARTNER` | `demo`: labeled sample pre-qualifications and quotes | A real partner adapter in `src/lib/server/partners.ts` `[VERIFY partners]` |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | No error monitoring | Server and browser errors, PII scrubbed; source maps with `SENTRY_AUTH_TOKEN` |

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
| `npm run perf:seed` then `npm run perf:deck` | Clone fixtures to ~50,000 listings, then time the deck path as the demo buyer (fails if p95 ≥ 150 ms). `npm run seed` resets |

## Deploy (Vercel Pro + Supabase)

1. **Supabase project** (staging and prod): `npx supabase link --project-ref <ref>` then `npx supabase db push`. Load reference data (ZIPs, markets, `app_config`) from the top of `supabase/seed.sql`. **Never load the full seed into a hosted project**: it creates demo accounts with a published password, including an admin.
2. **Auth**: enable the Email provider. In *Auth → Email Templates → Magic Link*, use `supabase/templates/otp_code.html` so emails carry the 6-digit `{{ .Token }}` (magic links open Safari from an installed iPhone app). Configure custom SMTP (Resend) because the built-in sender is heavily rate-limited. Add your site URL and `https://<domain>/auth/callback` to redirect URLs.
3. **Vercel**: import the repo, set the env vars from `.env.example` (never set `NEXT_PUBLIC_DEMO_LOGIN` in production), set `CRON_SECRET`. `vercel.json` schedules the jobs (ingest and enrich every 10 min, dispatch and lead billing every 5 min, maintenance hourly, stats, insights and dealer feeds daily). Each branch gets a preview URL.
4. **Stripe** (Phase 2): create the Billing Meter (`matched_lead`), a metered price on it, the insights and promotion prices, and a webhook to `https://<domain>/api/webhooks/stripe`. Set the `STRIPE_*` vars. MVP dealers invoiced by hand get `billing_exempt = true`.
5. **Storage**: migrations create the `listing-photos` (public), `vault` and `trade-photos` (private) buckets with per-user folder policies.

## Project layout

```
src/app/(buyer)        deck, likes, offers, chat, profile, car detail, journey (match to keys), trade-in
src/app/sell           private seller: listings, wizard, buyers, chat, bill of sale
src/app/dealer         leads, inventory + feeds, insights, team, billing, settings, chat
src/app/join           self-serve dealer signup, team invites
src/app/admin          overview, dealers, moderation, billing, market, config, outbox, reports, jobs, audit
src/app/api            deck, swipes, brief, onboarding, agent (draft, counter), sell, dealer, phone, finance,
                       insurance, trade, inspections, vault, ics, messages, prefs, push, webhooks (resend, stripe), cron
src/lib/deck           filters (pass 1), ranking (pass 2), rescue, progressive profiling
src/lib/ai             Claude client with budget + fallbacks; onboarding, brief, negotiator, summaries
src/lib/server         server services (deck, leads/ADF dispatch, inbound email, ingest, enrich, email, push,
                       sell + moderation, dealer feeds, billing, insights, phone verification, partners)
src/lib/safety         chat scam scoring, listing risk rules, photo hashes
src/lib/money.ts       TN tax, out-the-door, payments, cost to own
src/lib/negotiation.ts counteroffer suggestions (negotiator v2)
scripts/perf           50k-listing seed and deck benchmark
supabase/migrations    schema, RLS, functions
scripts/fixtures       synthetic Nashville inventory generator
```

## Open items from the spec

- `[VERIFY]` Tennessee tax/fee rates (in `app_config.tax_tn`), MarketCheck field names and license terms, Resend inbound payload shape, rideshare-eligible model years.
- `[VERIFY TN]` The private-sale cap (`app_config.private_sales.max_listings_per_year`, set to 4 because 5+ sales a year generally needs a dealer license), title/registration steps and the bill-of-sale template, and whether per-lead fees fit Tennessee Motor Vehicle Commission rules.
- `[VERIFY partners]` Lender and insurance partners: the demo adapters return labeled sample numbers; real partners plug into `src/lib/server/partners.ts` through their hosted soft-pull and quote flows (CarSwipe never collects SSNs).
- `[SET]` Kill-criteria targets, APR assumptions, doc fee default, questions-per-swipes pacing, matched-lead, insights and promotion prices (keep in sync with Stripe): all editable in Admin → Config.
- Performance: the realistic deck (a buyer with criteria, ~11.5k eligible of 50k) measures p95 ≈ 120 ms locally; the stress case with no criteria and a 150-mile radius (all 50k eligible) is ≈ 145 ms p50 / 175 ms p95 on a 4-core sandbox. The CI perf job reports both without blocking merges.
- Image-embedding provider: visual taste currently uses 16-dimension style fingerprints (fixtures and `attribute-style-v1` for real listings); swap in photo embeddings in `src/lib/server/enrich.ts`.
- Final product name (`NEXT_PUBLIC_APP_NAME`) and counsel review of `/legal/*` drafts.
