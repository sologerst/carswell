import { z } from "zod";
import { ApiError, apiProfile, json, readJson, route } from "@/lib/server/api";
import { buyerContext, filtersFor } from "@/lib/server/deck";
import { markTasteDone } from "@/lib/server/onboarding";
import type { DeckCandidate } from "@/lib/types";

function parseVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as number[];
    } catch {
      return null;
    }
  }
  return null;
}

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na * nb) || 1);
}

/** Three "which looks better?" pairs: cars from the buyer's filters with the most different styles. */
export const GET = route(async () => {
  const { supabase, profile } = await apiProfile();
  const ctx = await buyerContext(supabase, profile);
  const filters = filtersFor(ctx, profile, ctx.prefs, Math.max(profile.radius_mi, 60));
  const { data } = await supabase.rpc("deck_candidates", { p_filters: filters as never, p_limit: 60, p_explore: 0 });
  let cars = (data ?? []) as unknown as DeckCandidate[];
  if (cars.length < 6) {
    const loose = { lat: filters.lat, lng: filters.lng, radius_mi: 100 };
    const { data: more } = await supabase.rpc("deck_candidates", { p_filters: loose as never, p_limit: 60, p_explore: 0 });
    cars = (more ?? []) as unknown as DeckCandidate[];
  }
  const { data: embs } = await supabase.from("listing_embeddings").select("listing_id, embedding").in("listing_id", cars.map((c) => c.id));
  const vec = new Map((embs ?? []).map((e) => [e.listing_id, parseVector(e.embedding)]));

  const pool = cars.filter((c) => vec.get(c.id) && c.photos.length);
  const used = new Set<string>();
  const pairs: { a: DeckCandidate; b: DeckCandidate }[] = [];
  for (let round = 0; round < 3; round++) {
    let best: { a: DeckCandidate; b: DeckCandidate; d: number } | null = null;
    const avail = pool.filter((c) => !used.has(c.id)).slice(0, 40);
    for (let i = 0; i < avail.length; i++) {
      for (let j = i + 1; j < avail.length; j++) {
        if (avail[i].make === avail[j].make) continue;
        const d = 1 - cosine(vec.get(avail[i].id)!, vec.get(avail[j].id)!);
        if (!best || d > best.d) best = { a: avail[i], b: avail[j], d };
      }
    }
    if (!best) break;
    used.add(best.a.id).add(best.b.id);
    pairs.push({ a: best.a, b: best.b });
  }
  const slim = (c: DeckCandidate) => ({ id: c.id, photo: c.photos[0], title: `${c.year} ${c.make} ${c.model}`, color: c.exterior_color });
  return json({ pairs: pairs.map((p) => ({ a: slim(p.a), b: slim(p.b) })) });
});

const Body = z.object({ chosen: z.array(z.string().uuid()).max(10), rejected: z.array(z.string().uuid()).max(10) });

/** Seed the taste vector with the picks, then finish onboarding. */
export const POST = route(async (req: Request) => {
  const { supabase, profile } = await apiProfile();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid taste picks.");
  const { error } = await supabase.rpc("seed_taste", { p_chosen: parsed.data.chosen, p_rejected: parsed.data.rejected });
  if (error) throw new ApiError(400, error.message);
  return json(await markTasteDone(supabase, profile));
});
