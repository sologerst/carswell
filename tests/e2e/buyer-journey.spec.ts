import { expect, test } from "@playwright/test";
import { loginDemo, SEEDED, signUpWithCode } from "./helpers";

test.describe("buyer journey", () => {
  test("new buyer: email code, onboarding chat, taste check, swipe and like", async ({ page }, info) => {
    const email = `e2e-${info.project.name}-${Date.now()}@example.com`;
    await signUpWithCode(page, email);
    await expect(page).toHaveURL(/\/onboarding/);

    // Opening question, then one free-text answer about their life.
    await expect(page.getByText("Tell me about your life")).toBeVisible();
    await page.getByLabel("Your answer").fill(
      "I'm Sam. Two kids and a golden retriever, lake weekends, highway commute. Looking for a used SUV around $500/mo. My ZIP is 37206. Trading in my car. Hoping to buy this month.",
    );
    await page.getByRole("button", { name: "Send" }).click();

    // Only the gaps get asked: radius, then fuel and history.
    await expect(page.getByText(/How far from 37206/)).toBeVisible();
    await page.getByRole("button", { name: "40 mi" }).click();
    await expect(page.getByText("Any fuel preference?")).toBeVisible();
    await page.getByRole("button", { name: "No preference" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Any history dealbreakers?")).toBeVisible();
    await page.getByRole("button", { name: "Both" }).click();

    // Three "which looks better?" picks seed visual taste.
    for (let i = 1; i <= 3; i++) {
      await expect(page.getByText(`Which looks better? ${i} of 3`)).toBeVisible();
      await page.locator("button:has(img)").first().click();
    }
    await expect(page.getByText("What I think you want")).toBeVisible();
    await page.getByRole("button", { name: "Start swiping" }).click();
    await expect(page).toHaveURL(/\/deck/);

    // Swipe by buttons and keys; undo.
    const card = page.locator("article").first();
    await expect(card).toBeVisible();
    const firstTitle = await card.getAttribute("aria-label");
    await page.getByRole("button", { name: /^Pass/ }).click();
    await expect(page.locator("article").first()).not.toHaveAttribute("aria-label", firstTitle!);
    await page.keyboard.press("z");
    await expect(page.locator("article").first()).toHaveAttribute("aria-label", firstTitle!);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("article").first()).not.toHaveAttribute("aria-label", firstTitle!);

    // The like shows up in Likes once the queue flushes.
    await expect.poll(async () => {
      await page.goto("/likes");
      return page.locator("main li").count();
    }, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  });

  test("Car Brief loads in under 2 seconds from the deck", async ({ page }) => {
    await loginDemo(page, "buyer");
    await page.goto("/deck");
    const start = Date.now();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog").getByText("Why it fits you")).toBeVisible();
    expect(Date.now() - start).toBeLessThan(2000);
    await expect(page.getByRole("dialog").getByText(/Est\. cost to own/)).toBeVisible();
  });

  test("like, dealer offer, buyer picks, chat opens", async ({ browser, page }, info) => {
    // Uses a single seeded lead, so it runs once per seed (on the first device profile).
    test.skip(info.project.name !== "pixel-7", "single-use seeded lead");
    // Dealer answers the seeded new lead with an out-the-door offer.
    const dealerCtx = await browser.newContext();
    const dealer = await dealerCtx.newPage();
    await loginDemo(dealer, "dealer");
    await dealer.goto(`/dealer/leads/${SEEDED.newLeadInterest}`);
    await expect(dealer.getByText("What Jordan sees")).toBeVisible();
    await dealer.getByLabel("Notes").fill("Includes a fresh detail.");
    await dealer.getByRole("button", { name: "Send offer" }).click();
    await expect(dealer.getByText(/Offer sent to Jordan/)).toBeVisible();

    // Buyer compares and picks it.
    await loginDemo(page, "buyer");
    await page.goto("/offers");
    const offerCard = page.locator(`[id="${SEEDED.newLeadInterest}"]`);
    await expect(offerCard.getByText("Includes a fresh detail.")).toBeVisible();
    await offerCard.getByRole("button", { name: "Pick this offer" }).click();
    await expect(page.getByText("It's a match!")).toBeVisible();
    await page.waitForURL(/\/chat\//);

    // Chat works both ways; contact unlocks for the dealer.
    await page.getByLabel("Message").fill("Can I see it Saturday?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Can I see it Saturday?")).toBeVisible();
    await dealer.goto(`/dealer/leads/${SEEDED.newLeadInterest}`);
    await expect(dealer.getByText("buyer@carswipe.dev")).toBeVisible();
    await dealer.getByRole("link", { name: "Open chat" }).click();
    await expect(dealer.getByText("Can I see it Saturday?")).toBeVisible();
    await dealerCtx.close();
  });
});
