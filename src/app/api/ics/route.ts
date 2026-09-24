import { buildIcs, resolveWindow, todayIn } from "@/lib/calendar";
import { env } from "@/lib/env";
import { ApiError, apiProfile, route } from "@/lib/server/api";

/** "Add to calendar" for a test-drive window: /api/ics?interest=<id>&day=Sat,+Sep+27&time=9am-12pm */
export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  const interestId = url.searchParams.get("interest") ?? "";
  const day = (url.searchParams.get("day") ?? "").slice(0, 40);
  const time = (url.searchParams.get("time") ?? "").slice(0, 20);
  const { supabase } = await apiProfile();
  const { data: interest } = await supabase.from("interests")
    .select("id, seller_user_id, listing:listings(year, make, model, zip), dealership:dealerships(name, address, city, state, zip, at_home_test_drive)")
    .eq("id", interestId).maybeSingle();
  if (!interest) throw new ApiError(404, "Car not found.");
  const window = resolveWindow({ day, time }, todayIn());
  if (!window) throw new ApiError(400, "Couldn't read that time.");
  const l = interest.listing as unknown as { year: number; make: string; model: string; zip: string | null };
  const d = interest.dealership as unknown as { name: string; address: string | null; city: string | null; state: string; zip: string | null } | null;
  const title = `${l.year} ${l.make} ${l.model}`;
  const ics = buildIcs({
    uid: `${interest.id}-${window.date.year}${window.date.month}${window.date.day}${window.startHour}@carswipe`,
    window,
    summary: `Test drive: ${title}${d ? ` at ${d.name}` : ""}`,
    description: `${d ? "Bring your driver's license and insurance card." : "Private sale: meet somewhere public in daylight. Bring your license and insurance card."}\n${env.siteUrl}/journey/${interest.id}`,
    location: d ? [d.address, d.city, d.state, d.zip].filter(Boolean).join(", ") : `Agree on a public meeting spot (near ZIP ${l.zip ?? ""})`,
    url: `${env.siteUrl}/journey/${interest.id}`,
  });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="test-drive-${l.make.toLowerCase()}-${l.model.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
});
