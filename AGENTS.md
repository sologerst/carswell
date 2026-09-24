<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CarSwipe working agreement

- Next.js 16: `src/proxy.ts` (not middleware), async `params` / `searchParams` / `cookies()`. Run `npx next typegen` after adding routes.
- Every table has Row Level Security. New tables need RLS enabled plus policies in the same migration; add a pgTAP test for anything that guards privacy.
- Swipes are written only through `record_swipes()`. Chat messages are inserted by the server after scam scoring (`/api/messages`).
- Buyer contact details never leave the database before a match, and never go into AI prompts sent about dealers.
- Every AI call goes through `src/lib/ai/client.ts` (budget, refusal fallback, returns null for fallback) and has a non-AI template path. Nothing is sent on a buyer's behalf without approval.
- Tunable numbers live in `app_config` (typed defaults in `src/lib/config.ts`), not in code.
- Private listings go live only through `publishListing()` (`src/lib/server/sell.ts`), which runs the moderation rules in `src/lib/safety/listing-risk.ts`. Known scam patterns are rejected, never just flagged. The deck shows only `review_status = 'approved'` cars.
- Demand insights are aggregates only: every reported number covers at least `app_config.insights.k_anonymity` distinct buyers (pgTAP-tested). Never expose per-buyer rows to dealers.
- Money moves through Stripe only (Checkout, Billing Meters, Portal); webhooks are idempotent via `stripe_events`. Fees are per matched lead, never per sale. Without `STRIPE_SECRET_KEY` the app runs on a dev entitlement.
- Paid placement is always labeled "Promoted" and capped (`app_config.promotions`).
- The deck SQL (`deck_candidates`, migration 13) builds its WHERE clause from typed literals. Keep it that way, and re-run `npm run perf:seed && npm run perf:deck` after changing it (p95 < 150 ms at 50k listings).
- Before pushing: `npm run lint && npm run typecheck && npm test && npm run build`; for DB changes also `npm run seed && npx supabase test db`.

## Dependencies (spec rule: no new library without a one-line justification)

| Package | Why |
| --- | --- |
| `next`, `react`, `react-dom` | App framework (spec stack) |
| `@supabase/supabase-js`, `@supabase/ssr` | Database, auth and realtime clients with cookie sessions |
| `@anthropic-ai/sdk` | Claude API for onboarding, briefs, negotiator, summaries |
| `zod` | Request validation and structured-output schemas for Claude |
| `motion` | Swipe physics and transitions (spec: Framer Motion) |
| `radix-ui` | Accessible dialog/slot primitives behind the shadcn-style components |
| `lucide-react` | Icons (spec) |
| `class-variance-authority`, `clsx`, `tailwind-merge` | shadcn-style component variants and class merging |
| `idb-keyval` | Tiny IndexedDB wrapper for the offline swipe queue |
| `web-push` | Sends Web Push (VAPID) notifications |
| `server-only` | Build-time guard that server modules never reach the client |
| `stripe` | Billing (Phase 2): Checkout, Billing Meters for matched leads, customer portal, webhook verification |
| `@sentry/nextjs` | Error monitoring (spec stack); env-gated, no session replay, PII scrubbed |
| `sharp` | Server-side photo hashing (duplicate / stolen photo checks), quality checks and resizing for AI vision; already Next's image dependency |
| dev: `supabase` | Local stack, migrations, type generation, pgTAP runner |
| dev: `vitest`, `@playwright/test`, `@axe-core/playwright` | Unit, end-to-end and accessibility tests (spec test matrix) |
| dev: `tsx` | Runs the TypeScript fixture and icon generators |
