import type { Metadata } from "next";
import { SellWizard, type WizardDraft } from "@/components/sell/sell-wizard";
import { loadConfig } from "@/lib/server/data";
import { requireProfile } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";
import type { BodyStyle } from "@/lib/types";

export const metadata: Metadata = { title: "List a car" };

export default async function NewListingPage({ searchParams }: PageProps<"/sell/new">) {
  const { draft: draftId } = await searchParams;
  const profile = await requireProfile("/sell/new");
  const supabase = await createClient();
  const config = await loadConfig(supabase);

  let draft: WizardDraft | null = null;
  if (typeof draftId === "string" && /^[0-9a-f-]{36}$/.test(draftId)) {
    const { data } = await supabase.from("listings")
      .select("id, vin, year, make, model, trim_level, miles, body_style, exterior_color, price, description, features, title_status, accident_count, owner_count, expected_price, review_status, listing_photos(id, url, position, quality)")
      .eq("id", draftId).eq("private_seller_id", profile.id).eq("review_status", "draft").maybeSingle();
    if (data) {
      draft = {
        ...data,
        body_style: data.body_style as BodyStyle,
        price: Number(data.price),
        expected_price: data.expected_price === null ? null : Number(data.expected_price),
        photos: [...(data.listing_photos ?? [])].sort((a, b) => a.position - b.position)
          .map((p) => ({ id: p.id, url: p.url, issues: (p.quality as { issues?: string[] } | null)?.issues ?? [] })),
      };
    }
  }

  return (
    <SellWizard
      userId={profile.id}
      zip={profile.zip}
      verifiedPhone={profile.phone_verified_at ? profile.phone : null}
      profilePhone={profile.phone}
      draft={draft}
      minPhotos={config.private_sales.min_photos}
      maxPhotos={config.private_sales.max_photos}
    />
  );
}
