import Link from "next/link";

export const metadata = { title: "Data sources" };

export default function DataSources() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-10 text-muted">
      <Link href="/" className="text-sm font-bold hover:text-ink">← CarSwipe</Link>
      <h1 className="text-3xl font-bold text-ink">Data sources</h1>
      <ul className="list-disc space-y-2 pl-5">
        <li><span className="font-bold text-ink">NHTSA vPIC</span>: VIN decoding. <span className="font-bold text-ink">NHTSA Recalls API</span>: open recalls. Courtesy of the U.S. National Highway Traffic Safety Administration.</li>
        <li><span className="font-bold text-ink">GeoNames</span>: ZIP code locations (CC BY 4.0).</li>
        <li><span className="font-bold text-ink">MarketCheck</span>: dealer and private-party listings, under license, with attribution and links back on aggregated cards.</li>
        <li>Demo inventory: 300 synthetic Nashville-area cars with fictional dealers and illustrated &quot;demo photos&quot;.</li>
      </ul>
      <p>Facebook Marketplace and Craigslist listings are never included.</p>
    </main>
  );
}
