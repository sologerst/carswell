import { z } from "zod";
import { ApiError, apiDealer, json, readJson, route } from "@/lib/server/api";
import { billingPortal, subscriptionCheckout } from "@/lib/server/billing";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkout"), product: z.enum(["leads", "insights"]) }),
  z.object({ action: z.literal("portal") }),
]);

/** Stripe Checkout (lead plan, insights plan) and the billing portal (owners). */
export const POST = route(async (req: Request) => {
  const { profile, dealership } = await apiDealer({ owner: true });
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid request.");
  const admin = createAdminClient();
  const url = parsed.data.action === "checkout"
    ? await subscriptionCheckout(admin, dealership, profile.email, parsed.data.product)
    : await billingPortal(admin, dealership, profile.email);
  return json({ url });
});
