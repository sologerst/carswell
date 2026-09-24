import { renderCarSvg } from "@/lib/fixtures/car-svg";
import { BODY_STYLES, type BodyStyle } from "@/lib/types";

const BODIES = new Set(BODY_STYLES.map((b) => b.key));

/** Demo "photos" for fixture cars: /fx/car/<body>/<hex>/<variant>. */
export async function GET(req: Request, ctx: RouteContext<"/fx/car/[body]/[color]/[variant]">) {
  const { body, color, variant } = await ctx.params;
  if (!BODIES.has(body as BodyStyle) || !/^[0-9a-f]{6}$/i.test(color) || !/^\d{1,2}$/.test(variant)) {
    return new Response("Not found", { status: 404 });
  }
  const label = new URL(req.url).searchParams.get("label") !== "0";
  return new Response(renderCarSvg(body as BodyStyle, color, Number(variant), { label }), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
