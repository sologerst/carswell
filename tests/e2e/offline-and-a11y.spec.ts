import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loginDemo } from "./helpers";

test("swipes made offline save once the connection is back", async ({ page, context }) => {
  await loginDemo(page, "buyer");
  await page.goto("/likes");
  const before = await page.locator("main li").count();

  await page.goto("/deck");
  await expect(page.locator("article").first()).toBeVisible();
  await context.setOffline(true);
  for (let i = 0; i < 3; i++) {
    const title = await page.locator("article").first().getAttribute("aria-label");
    await page.getByRole("button", { name: /^Like/ }).click();
    await expect(page.locator("article").first()).not.toHaveAttribute("aria-label", title!);
  }
  await expect(page.getByText(/Offline · 3 saved/)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(/Offline ·|Syncing/)).toBeHidden({ timeout: 30_000 });
  await page.goto("/likes");
  await expect(page.locator("main li")).toHaveCount(before + 3);
});

test("screen readers hear each swipe, and keyboard shortcuts work", async ({ page }) => {
  await loginDemo(page, "buyer");
  await page.goto("/deck");
  const title = await page.locator("article").first().getAttribute("aria-label");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("[aria-live=polite]").first()).toContainText(/Passed/);
  await page.keyboard.press("z");
  await expect(page.locator("article").first()).toHaveAttribute("aria-label", title!);
});

for (const path of ["/", "/login"]) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

for (const path of ["/deck", "/likes", "/offers", "/profile"]) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await loginDemo(page, "buyer");
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  });
}
