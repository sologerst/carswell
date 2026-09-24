import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { loginDemo } from "./helpers";

// Off-platform dealer: a like becomes an ADF lead email (captured in the dev
// outbox), the dealer replies by email, and the reply becomes an offer.
test("off-platform dealer email reply creates an offer the buyer can pick", async ({ page, browser }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const key = process.env.SUPABASE_SECRET_KEY;
  test.skip(!key, "SUPABASE_SECRET_KEY is needed to find an email-channel car");
  const admin = createClient(url, key!, { auth: { persistSession: false } });
  const { data: dealers } = await admin.from("dealerships").select("id").eq("lead_channel", "email");
  // A car the demo buyer hasn't swiped yet, so the test can be re-run without reseeding.
  const { data: swiped } = await admin.from("swipes").select("listing_id").eq("user_id", "00000000-0000-4000-8000-00000000b001");
  const seen = (swiped ?? []).map((s) => s.listing_id).filter(Boolean);
  let q = admin.from("listings").select("id, year, make, model")
    .in("dealership_id", (dealers ?? []).map((d) => d.id)).eq("is_active", true).eq("is_canonical", true);
  if (seen.length) q = q.not("id", "in", `(${seen.join(",")})`);
  const { data: listing } = await q.limit(1).single();

  await loginDemo(page, "buyer");
  const swipe = await page.request.post("/api/swipes", {
    data: { swipes: [{ client_id: crypto.randomUUID(), listing_id: listing!.id, action: "like" }] },
  });
  expect(swipe.ok()).toBe(true);
  const { results } = await swipe.json();
  const interestId = results[0].interest_id as string;
  expect(interestId).toBeTruthy();

  // The dispatch job sends the ADF email (dev_outbox without Resend).
  await expect.poll(async () => {
    await page.request.get("/api/cron/dispatch", {
      headers: process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {},
    });
    const { data } = await admin.from("dev_outbox").select("id").eq("kind", "lead_adf").contains("meta", { interest_id: interestId });
    return data?.length ?? 0;
  }, { timeout: 30_000 }).toBeGreaterThan(0);

  // Admin simulates the dealer's email reply.
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await loginDemo(adminPage, "admin");
  await adminPage.goto("/admin/outbox");
  const email = adminPage.locator("div", { has: adminPage.getByText(`CarSwipe lead: ${listing!.year} ${listing!.make} ${listing!.model}`) }).filter({ has: adminPage.getByRole("button", { name: "Send simulated reply" }) }).last();
  await email.getByRole("textbox").fill("Our out the door price is $31,250 including tax, title and fees.");
  await email.getByRole("button", { name: "Send simulated reply" }).click();
  await adminPage.waitForLoadState("networkidle");
  await adminCtx.close();

  await page.goto("/offers");
  const card = page.locator(`[id="${interestId}"]`);
  await expect(card.getByRole("cell", { name: "$31,250" }).first()).toBeVisible();
  await expect(card.getByText("(by email)")).toBeVisible();
  await expect(card.getByRole("cell", { name: "Not itemized" }).first()).toBeVisible();
  await card.getByRole("button", { name: "Pick this offer" }).click();
  await page.waitForURL(/\/chat\//);
});
