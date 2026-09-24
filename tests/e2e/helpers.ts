import { expect, type Page } from "@playwright/test";

export const DEMO = {
  buyer: { email: "buyer@carswipe.dev", label: "Demo buyer" },
  dealer: { email: "dealer@carswipe.dev", label: "Demo dealer" },
  admin: { email: "admin@carswipe.dev", label: "Admin" },
} as const;

export const SEEDED = {
  newLeadInterest: "00000000-0000-4000-8000-0000000e0001",
  matchedConversation: "00000000-0000-4000-8000-0000000c0001",
};

export async function loginDemo(page: Page, who: keyof typeof DEMO) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(DEMO[who].label) }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Read the newest 6-digit sign-in code sent to an address (local Mailpit). */
export async function latestCode(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`);
    if (res.ok) {
      const body = (await res.json()) as { messages?: { ID: string }[] };
      const id = body.messages?.[0]?.ID;
      if (id) {
        const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Text?: string; HTML?: string };
        const code = /\b(\d{6})\b/.exec(`${msg.Text ?? ""} ${msg.HTML ?? ""}`)?.[1];
        if (code) return code;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No sign-in code arrived for ${email}`);
}

export async function signUpWithCode(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /Email me a code/ }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  await page.getByLabel("Code").fill(await latestCode(email));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
