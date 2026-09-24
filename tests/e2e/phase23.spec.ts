import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { withCheckDigit } from "../../src/lib/vin";
import { loginDemo, SEEDED } from "./helpers";

// Phase 2/3 journeys: private selling (VIN, photos, snap-to-list, fraud
// checks), counteroffers, dealer CSV feeds, demand insights, match-to-keys.

/** Distinct random-noise JPEGs, so photo-hash checks never match other cars. */
async function photos(n: number, seed: number) {
  return Promise.all(Array.from({ length: n }, async (_, i) => {
    const w = 64;
    const px = Buffer.alloc(w * w * 3);
    let x = seed * 7919 + i * 104729;
    for (let k = 0; k < px.length; k++) { x = (x * 1103515245 + 12345) & 0x7fffffff; px[k] = x & 0xff; }
    const buffer = await sharp(px, { raw: { width: w, height: w, channels: 3 } }).resize(900, 675, { kernel: "nearest" }).jpeg().toBuffer();
    return { name: `car-${i + 1}.jpg`, mimeType: "image/jpeg", buffer };
  }));
}

/** A valid synthetic Honda CR-V VIN per project and purpose. */
function vin(project: string, purpose: number) {
  const serial = String(500000 + (project === "pixel-7" ? 0 : 5000) + purpose * 100 + Math.floor(Date.now() / 1000) % 97).padStart(6, "0");
  return withCheckDigit(`2HKRW2H50KL${serial}`);
}

async function listCar(page: Page, opts: { vin: string; description?: string; seed: number }) {
  await page.goto("/sell/new");
  await expect(page.getByRole("heading", { name: "What are you selling?" })).toBeVisible();
  const decoded = page.waitForResponse((r) => r.url().includes("/api/vin/"));
  await page.getByLabel("VIN", { exact: true }).fill(opts.vin);
  await decoded;
  await page.getByLabel("Year").fill("2019");
  await page.getByLabel("Make").fill("Honda");
  await page.getByLabel("Model").fill("CR-V");
  await page.getByLabel("Trim").fill("EX");
  await page.getByLabel("Odometer (miles)").fill("61000");
  await page.getByLabel("Exterior color").fill("Blue");
  await page.getByLabel("ZIP where the car is").fill("37212");
  await page.getByRole("button", { name: "Compact SUV" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Add photos" })).toBeVisible();
  await page.getByLabel("Add photos").setInputFiles(await photos(3, opts.seed));
  await expect(page.getByRole("img", { name: /^Photo \d$/ })).toHaveCount(3, { timeout: 30_000 });
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Describe it" })).toBeVisible();
  await page.getByLabel("Your notes").fill("One owner, new tires, always garaged.");
  await page.getByRole("button", { name: "Write my listing" }).click();
  await expect(page.getByLabel("Description")).not.toHaveValue("", { timeout: 30_000 });
  if (opts.description) await page.getByLabel("Description").fill(opts.description);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Set your price" })).toBeVisible();
  const fair = page.getByRole("button", { name: /Fair range low/ });
  if (await fair.isVisible()) await fair.click();
  else await page.getByLabel("Asking price").fill("21000");
  await page.getByRole("button", { name: "Continue" }).click();

  // The demo seller's phone is already verified, so the wizard goes straight to review.
  await expect(page.getByRole("heading", { name: "Review and publish" })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Publish" }).click();
}

test.describe("private sellers", () => {
  test("list a car: VIN, photos, snap-to-list, price, publish", async ({ page }, info) => {
    await loginDemo(page, "seller");
    await listCar(page, { vin: vin(info.project.name, 1), seed: 1 });
    await expect(page.getByRole("heading", { name: "Your car is live" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "View listing" }).click();
    await expect(page.getByRole("heading", { name: /2019 Honda CR-V EX/ })).toBeVisible();
    await expect(page.getByText("live", { exact: true })).toBeVisible();
  });

  test("fraud checks block a listing with known scam patterns", async ({ page }, info) => {
    await loginDemo(page, "seller");
    await listCar(page, {
      vin: vin(info.project.name, 2),
      seed: 2,
      description: "Must sell fast. I'm deployed overseas so the car is with eBay Motors protection shipping. Pay with gift cards and it ships to you.",
    });
    await expect(page.getByRole("heading", { name: "We can't publish this listing" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/known scam patterns/)).toBeVisible();
  });

  test("seller answers a buyer with a price", async ({ page }, info) => {
    test.skip(info.project.name !== "pixel-7", "single-use seeded lead");
    await loginDemo(page, "seller");
    await page.goto(`/sell/leads/${SEEDED.sellerLead}`);
    await expect(page.getByRole("heading", { name: "Riley" })).toBeVisible();
    await expect(page.getByText(/paid at the county clerk/)).toBeVisible();
    await page.getByRole("button", { name: "Send price" }).click();
    await expect(page.getByText(/Price sent to Riley/)).toBeVisible();
  });

  test("admin reviews a held listing", async ({ page }, info) => {
    test.skip(info.project.name !== "pixel-7", "single-use seeded listing");
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginDemo(page, "admin");
    await page.goto("/admin/moderation");
    const card = page.locator("div", { has: page.getByText("2018 Ford F-150 XLT") }).filter({ has: page.getByRole("button", { name: "Reject" }) }).last();
    await expect(card.getByText("price too low")).toBeVisible();
    await card.getByPlaceholder(/Reason/).fill("Price and story match a shipping scam.");
    await card.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByText("2018 Ford F-150 XLT").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" })).toHaveCount(0);
  });
});

test("buyer counteroffers and the dealer matches it", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "pixel-7", "single-use seeded offer");
  await loginDemo(page, "buyer");
  await page.goto("/offers");
  const card = page.locator(`[id="${SEEDED.offeredInterest}"]`);
  await card.getByRole("button", { name: "Counteroffer" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Suggested counter")).toBeVisible({ timeout: 30_000 });
  const amount = Number((await sheet.getByLabel("Your counter (out the door)").inputValue()).replace(/\D/g, ""));
  expect(amount).toBeGreaterThan(0);
  await expect(sheet.getByLabel(/Message/)).not.toHaveValue("");
  await sheet.getByRole("button", { name: "Send counteroffer" }).click();
  await expect(card.getByText(/You countered .*waiting for a reply/)).toBeVisible();

  const dealerCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dealer = await dealerCtx.newPage();
  await loginDemo(dealer, "dealer");
  await dealer.goto(`/dealer/leads/${SEEDED.offeredInterest}`);
  await expect(dealer.getByText(/Jordan countered at/)).toBeVisible();
  await dealer.getByRole("button", { name: /^Match / }).click();
  await dealer.getByRole("button", { name: "Send offer" }).click();
  await expect(dealer.getByText(/Offer sent to Jordan/)).toBeVisible();
  await dealerCtx.close();

  await page.reload();
  await expect(card.getByText(/You countered .*accepted/)).toBeVisible();
});

test("dealer uploads a CSV inventory feed", async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginDemo(page, "dealer");
  await page.goto("/dealer/inventory");
  const base = info.project.name === "pixel-7" ? 700000 : 710000;
  const vins = [0, 1].map((i) => withCheckDigit(`JTMRWRFV0LD${String(base + i + (Math.floor(Date.now() / 1000) % 89) * 2)}`));
  const csv = [
    "VIN,Year,Make,Model,Trim,Price,Mileage,Condition,Body Style,Exterior Color,Photos,Stock",
    `${vins[0]},2020,Toyota,RAV4,XLE,"$24,995",38000,used,SUV,Blue,https://example.com/a.jpg,S1`,
    `${vins[1]},2020,Toyota,RAV4,LE,23495,41000,used,SUV,White,,S2`,
    "BADVIN,2020,Toyota,RAV4,LE,1,1,used,SUV,White,,S3",
  ].join("\n");
  await page.getByLabel("Full feed: mark cars missing from this file as sold").uncheck();
  await page.getByLabel("CSV feed file").setInputFiles({ name: "feed.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  const result = page.getByRole("status").filter({ hasText: "added" });
  await expect(result).toContainText("2 added", { timeout: 60_000 });
  await expect(result).toContainText("Invalid VIN");
  await page.getByLabel("Search inventory").fill(vins[0]);
  await expect(page.getByText("2020 Toyota RAV4 XLE")).toBeVisible();
});

test("dealer sees demand insights and billing", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginDemo(page, "dealer");
  await page.goto("/dealer/insights");
  await expect(page.getByText("Cars buyers pass on most")).toBeVisible();
  await expect(page.getByRole("group").first()).toBeVisible();
  await page.getByRole("button", { name: "Show table" }).first().click();
  await expect(page.getByRole("columnheader", { name: "Passes" })).toBeVisible();
  await expect(page.getByText(/Wagon under/)).toBeVisible();
  await page.goto("/dealer/billing");
  await expect(page.getByText("Matched leads").first()).toBeVisible();
  await expect(page.getByText(/Dev entitlement|Active|Not set up/).first()).toBeVisible();
});

test("match to keys: calendar file and a saved checklist", async ({ page }) => {
  await loginDemo(page, "buyer");
  await page.goto(`/journey/${SEEDED.matchedInterest}`);
  await expect(page.getByRole("heading", { name: "From match to keys" })).toBeVisible();
  const href = await page.getByRole("link", { name: "Add to calendar" }).first().getAttribute("href");
  const ics = await page.request.get(href!);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("BEGIN:VEVENT");

  const item = page.getByRole("checkbox", { name: /Insured from the day of purchase/ });
  const before = await item.getAttribute("aria-checked");
  await item.click();
  const after = before === "true" ? "false" : "true";
  await expect(item).toHaveAttribute("aria-checked", after);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Insured from the day of purchase/ })).toHaveAttribute("aria-checked", after);

  await page.getByRole("button", { name: "Get a quote" }).click();
  await expect(page.getByText(/Sample quote from the demo partner/)).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test("the sell wizard is accessible", async ({ page }) => {
  await loginDemo(page, "seller");
  await page.goto("/sell/new");
  await expect(page.getByRole("heading", { name: "What are you selling?" })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
