// Approximate location: where the car is relative to your ZIP, without a map
// provider or an exact address.

export function MiniMap({ from, to, label }: { from: { lat: number; lng: number }; to: { lat: number; lng: number }; label: string }) {
  const dy = (to.lat - from.lat) * 69;
  const dx = (to.lng - from.lng) * 69 * Math.cos((from.lat * Math.PI) / 180);
  const dist = Math.sqrt(dx * dx + dy * dy);
  const scale = 70 / Math.max(dist, 5);
  const cx = 110 + dx * scale;
  const cy = 90 - dy * scale;
  const bearing = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360 / 45) % 8];
  return (
    <figure className="overflow-hidden rounded-3xl bg-navy-850">
      <svg viewBox="0 0 220 180" className="h-44 w-full" role="img" aria-label={`About ${Math.round(dist)} miles ${bearing} of you`}>
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="#18264f" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="220" height="180" fill="url(#grid)" />
        <circle cx="110" cy="90" r="70" fill="none" stroke="#22336a" strokeDasharray="4 4" />
        <line x1="110" y1="90" x2={cx} y2={cy} stroke="#6d5efc" strokeWidth="2" strokeDasharray="3 3" />
        <circle cx="110" cy="90" r="6" fill="#f3f5fb" />
        <circle cx={cx} cy={cy} r="14" fill="#6d5efc" opacity=".25" />
        <circle cx={cx} cy={cy} r="7" fill="#6d5efc" />
      </svg>
      <figcaption className="flex items-center justify-between px-4 pb-3 text-sm">
        <span className="text-muted">You · {label}</span>
        <span className="font-bold">~{Math.max(1, Math.round(dist))} mi {bearing}</span>
      </figcaption>
    </figure>
  );
}
