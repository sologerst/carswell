import { ApiError, apiProfile, json, route } from "@/lib/server/api";
import { decodeVin } from "@/lib/server/vin-decode";
import { isValidVin } from "@/lib/vin";

/** VIN decode (NHTSA vPIC) + open recalls (NHTSA), cached for 30 / 7 days. */
export const GET = route(async (_req: Request, ctx: RouteContext<"/api/vin/[vin]">) => {
  const { vin: raw } = await ctx.params;
  const vin = raw.toUpperCase();
  if (!isValidVin(vin)) throw new ApiError(400, "That VIN doesn't pass the check-digit test.");
  await apiProfile();
  const result = await decodeVin(vin);
  return json({ ...result, source: "NHTSA vPIC and Recalls APIs" });
});
