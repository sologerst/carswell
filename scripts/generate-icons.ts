// Generates PWA icons in public/icons from one SVG mark. Run: npx tsx scripts/generate-icons.ts
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const mark = (inset: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5efc"/><stop offset=".6" stop-color="#9d8cff"/><stop offset="1" stop-color="#38bdf8"/></linearGradient>
  </defs>
  <rect width="512" height="512" rx="${inset ? 0 : 112}" fill="#060b1a"/>
  <g transform="translate(${inset} ${inset}) scale(${(512 - inset * 2) / 512})">
    <rect x="40" y="40" width="432" height="432" rx="100" fill="url(#g)"/>
    <g transform="rotate(-9 256 256)">
      <rect x="150" y="118" width="212" height="276" rx="34" fill="#ffffff" opacity=".28"/>
    </g>
    <rect x="166" y="130" width="212" height="276" rx="34" fill="#ffffff"/>
    <path d="M206 318 q6-38 38-44 l24-30 q8-10 22-10 h28 q16 0 24 12 l20 30 q24 6 24 30 v14 q0 8-8 8 h-144 q-8 0-8-10z" fill="#060b1a"/>
    <circle cx="238" cy="334" r="16" fill="#060b1a" stroke="#fff" stroke-width="6"/>
    <circle cx="318" cy="334" r="16" fill="#060b1a" stroke="#fff" stroke-width="6"/>
    <path d="M226 200 h92" stroke="#6d5efc" stroke-width="14" stroke-linecap="round"/>
  </g>
</svg>`;

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon.svg", mark(0));
const out = async (size: number, name: string, inset = 0) =>
  sharp(Buffer.from(mark(inset))).resize(size, size).png().toFile(`public/icons/${name}`);

Promise.all([
  out(192, "icon-192.png"),
  out(512, "icon-512.png"),
  out(512, "icon-maskable-512.png", 56),
  out(180, "apple-touch-icon.png", 0),
  out(72, "badge-72.png"),
  out(48, "favicon-48.png"),

]).then(() => console.log("icons written to public/icons"));
