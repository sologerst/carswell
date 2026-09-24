// Stylized side-profile renders used as photos for the synthetic fixture cars
// (real listings hotlink their source photos). Pure string output, no deps.

import type { BodyStyle } from "../types";

interface Shape {
  r: number;
  rearX: number;
  frontX: number;
  /** Outline points from rear-bottom, over the roof, to front-bottom. */
  top: [number, number][];
  /** Greenhouse (window) polygon; null for no roof. */
  glass: [number, number][] | null;
  pillarX: number | null;
  wheelRear: number;
  wheelFront: number;
  windshield?: [number, number][];
}

const GROUND = 470;

const SHAPES: Record<BodyStyle, Shape> = {
  sedan: {
    r: 44, rearX: 130, frontX: 682, wheelRear: 250, wheelFront: 562, pillarX: 405,
    top: [[132, 398], [140, 372], [165, 360], [262, 350], [338, 293], [470, 289], [562, 345], [655, 358], [678, 372], [684, 400]],
    glass: [[275, 348], [342, 302], [462, 299], [540, 345]],
  },
  coupe: {
    r: 44, rearX: 140, frontX: 682, wheelRear: 255, wheelFront: 565, pillarX: null,
    top: [[142, 400], [148, 376], [175, 364], [250, 356], [352, 300], [452, 297], [560, 348], [655, 360], [678, 374], [684, 402]],
    glass: [[268, 354], [356, 309], [446, 306], [535, 348]],
  },
  convertible: {
    r: 44, rearX: 140, frontX: 682, wheelRear: 255, wheelFront: 565, pillarX: null,
    top: [[142, 400], [148, 376], [175, 364], [300, 356], [520, 352], [560, 350], [655, 360], [678, 374], [684, 402]],
    glass: null,
    windshield: [[512, 352], [468, 306], [478, 304], [526, 350]],
  },
  hatchback: {
    r: 42, rearX: 170, frontX: 652, wheelRear: 268, wheelFront: 552, pillarX: 402,
    top: [[172, 398], [174, 350], [190, 318], [236, 290], [430, 287], [522, 342], [628, 358], [648, 372], [654, 400]],
    glass: [[196, 330], [240, 298], [424, 296], [498, 342]],
  },
  wagon: {
    r: 44, rearX: 128, frontX: 682, wheelRear: 248, wheelFront: 562, pillarX: 330,
    top: [[130, 398], [133, 350], [150, 302], [172, 292], [470, 290], [562, 344], [655, 358], [678, 372], [684, 400]],
    glass: [[160, 312], [176, 300], [465, 298], [540, 344], [160, 344]],
  },
  compact_suv: {
    r: 48, rearX: 150, frontX: 672, wheelRear: 262, wheelFront: 560, pillarX: 400,
    top: [[152, 392], [154, 340], [170, 292], [196, 280], [468, 276], [566, 334], [652, 348], [668, 364], [674, 394]],
    glass: [[182, 300], [200, 288], [462, 285], [542, 334], [182, 334]],
  },
  midsize_suv: {
    r: 50, rearX: 140, frontX: 676, wheelRear: 258, wheelFront: 566, pillarX: 395,
    top: [[142, 390], [143, 330], [152, 274], [170, 264], [482, 262], [572, 326], [658, 340], [672, 356], [678, 392]],
    glass: [[162, 284], [174, 272], [476, 271], [548, 326], [162, 326]],
  },
  three_row_suv: {
    r: 50, rearX: 118, frontX: 692, wheelRear: 238, wheelFront: 590, pillarX: 330,
    top: [[120, 390], [121, 330], [130, 268], [146, 258], [505, 256], [590, 320], [676, 336], [690, 352], [694, 390]],
    glass: [[140, 278], [150, 266], [498, 265], [566, 320], [140, 320]],
  },
  minivan: {
    r: 44, rearX: 118, frontX: 692, wheelRear: 232, wheelFront: 586, pillarX: 300,
    top: [[120, 396], [121, 330], [128, 272], [146, 258], [470, 254], [612, 336], [674, 356], [690, 370], [694, 398]],
    glass: [[138, 280], [150, 266], [466, 263], [590, 336], [138, 336]],
  },
  pickup: {
    r: 52, rearX: 108, frontX: 702, wheelRear: 222, wheelFront: 590, pillarX: 430,
    top: [[110, 390], [111, 352], [334, 352], [338, 270], [352, 262], [472, 260], [562, 322], [680, 334], [698, 350], [704, 392]],
    glass: [[350, 272], [356, 268], [466, 268], [540, 322], [350, 322]],
  },
};

const SCENES = [
  // studio navy
  (id: string) => `<defs><radialGradient id="bg${id}" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#26356b"/><stop offset="1" stop-color="#070d1f"/></radialGradient></defs>
    <rect width="800" height="600" fill="url(#bg${id})"/><rect y="470" width="800" height="130" fill="#0a1128"/>
    <ellipse cx="400" cy="470" rx="380" ry="16" fill="#1a2a55" opacity=".6"/>`,
  // dusk skyline
  (id: string) => `<defs><linearGradient id="bg${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f4b"/><stop offset=".55" stop-color="#7a3d6e"/><stop offset=".85" stop-color="#f08a5d"/></linearGradient></defs>
    <rect width="800" height="600" fill="url(#bg${id})"/>
    <path d="M0 420 V360 h40 v-30 h30 v40 h50 v-70 h24 v70 h40 v-40 h60 v60 h30 v-110 l14 -30 l14 30 v-8 h8 v-30 h6 v30 h8 v8 v110 h40 v-50 h50 v40 h40 v-80 h36 v80 h60 v-30 h40 v50 h58 v-40 h70 V420 Z" fill="#231a3d" opacity=".9"/>
    <rect y="420" width="800" height="180" fill="#2a2140"/><rect y="468" width="800" height="4" fill="#3b2f58"/>`,
  // day hills
  (id: string) => `<defs><linearGradient id="bg${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ec5ff"/><stop offset="1" stop-color="#dff0ff"/></linearGradient></defs>
    <rect width="800" height="600" fill="url(#bg${id})"/>
    <path d="M0 400 Q150 330 320 380 T640 360 T800 380 V600 H0Z" fill="#7fb07a"/><path d="M0 430 Q200 380 420 420 T800 410 V600 H0Z" fill="#5f9460"/>
    <rect y="455" width="800" height="145" fill="#5b6270"/><rect y="520" width="800" height="6" fill="#e6e1c8" opacity=".7"/>`,
  // night garage
  (id: string) => `<defs><linearGradient id="bg${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#15171c"/><stop offset="1" stop-color="#2a2d35"/></linearGradient></defs>
    <rect width="800" height="600" fill="url(#bg${id})"/>
    ${[80, 250, 420, 590].map((x) => `<rect x="${x}" y="70" width="130" height="8" rx="4" fill="#dfe8ff" opacity=".85"/>`).join("")}
    <rect y="470" width="800" height="130" fill="#1b1d23"/><path d="M0 540 H800" stroke="#e8c547" stroke-width="4" stroke-dasharray="40 30" opacity=".6"/>`,
  // light studio
  (id: string) => `<defs><radialGradient id="bg${id}" cx="50%" cy="35%" r="80%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfd6e4"/></radialGradient></defs>
    <rect width="800" height="600" fill="url(#bg${id})"/><rect y="470" width="800" height="130" fill="#c3cad8"/>`,
  // lake sunset
  (id: string) => `<defs><linearGradient id="bg${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb36b"/><stop offset=".45" stop-color="#ff8a65"/><stop offset=".62" stop-color="#6d5efc"/></linearGradient></defs>
    <rect width="800" height="600" fill="url(#bg${id})"/><circle cx="600" cy="300" r="46" fill="#ffe2a8" opacity=".9"/>
    <rect y="330" width="800" height="120" fill="#4a57b8" opacity=".75"/><path d="M0 340 Q200 320 400 345 T800 335" stroke="#fff" stroke-opacity=".25" fill="none"/>
    <rect y="450" width="800" height="150" fill="#2c2f45"/>`,
];

function shade(hex: string, amt: number): string {
  const n = parseInt(hex, 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = c((n >> 16) & 255), g = c((n >> 8) & 255), b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function wheel(cx: number, r: number, id: string): string {
  const cy = GROUND - r;
  const spokes = Array.from({ length: 5 }, (_, i) => {
    const a = (i * 72 * Math.PI) / 180;
    return `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * r * 0.55).toFixed(1)}" y2="${(cy + Math.sin(a) * r * 0.55).toFixed(1)}" stroke="#aab2c3" stroke-width="${(r * 0.12).toFixed(1)}" stroke-linecap="round"/>`;
  }).join("");
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0d0f14"/><circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="url(#rim${id})"/>${spokes}<circle cx="${cx}" cy="${cy}" r="${r * 0.14}" fill="#5b6475"/>`;
}

export function renderCarSvg(body: BodyStyle, colorHex: string, variant: number, opts: { label?: boolean } = {}): string {
  const s = SHAPES[body] ?? SHAPES.sedan;
  const hex = /^[0-9a-f]{6}$/i.test(colorHex) ? colorHex.toLowerCase() : "5d636b";
  const id = `${body}${hex}${variant}`.replace(/[^a-z0-9]/gi, "");
  const scene = SCENES[((variant % SCENES.length) + SCENES.length) % SCENES.length](id);
  const mirror = variant % 2 === 1;
  const bottom = 436;
  const archPath = (cx: number) => `L${cx + s.r + 8},${bottom} A${s.r + 8},${s.r + 8} 0 0 0 ${cx - s.r - 8},${bottom}`;
  const outline = [
    `M${s.rearX + 6},${bottom}`,
    ...s.top.map(([x, y]) => `L${x},${y}`),
    `L${s.frontX - 4},${bottom}`,
    archPath(s.wheelFront),
    archPath(s.wheelRear),
    "Z",
  ].join(" ");
  const glass = s.glass ? `<path d="M${s.glass.map(([x, y]) => `${x},${y}`).join(" L")} Z" fill="url(#glass${id})"/>` : "";
  const pillar = s.pillarX && s.glass ? `<rect x="${s.pillarX - 5}" y="${Math.min(...s.glass.map((p) => p[1])) - 2}" width="10" height="${Math.max(...s.glass.map((p) => p[1])) - Math.min(...s.glass.map((p) => p[1])) + 4}" fill="${shade(hex, -0.25)}"/>` : "";
  const windshield = s.windshield ? `<path d="M${s.windshield.map(([x, y]) => `${x},${y}`).join(" L")} Z" fill="url(#glass${id})"/>` : "";
  const beltY = s.glass ? Math.max(...s.glass.map((p) => p[1])) + 6 : 360;
  const frontTop = s.top[s.top.length - 2];
  const rearTop = s.top[1];
  const car = `
    <ellipse cx="${(s.rearX + s.frontX) / 2}" cy="${GROUND + 2}" rx="${(s.frontX - s.rearX) / 2 + 10}" ry="14" fill="#000" opacity=".35"/>
    <path d="${outline}" fill="url(#paint${id})" stroke="${shade(hex, -0.3)}" stroke-width="2"/>
    ${glass}${pillar}${windshield}
    <path d="M${s.rearX + 20},${beltY} L${s.frontX - 40},${beltY + 2}" stroke="#fff" stroke-opacity=".28" stroke-width="3"/>
    <path d="M${(s.wheelRear + s.wheelFront) / 2 - 10},${beltY + 4} L${(s.wheelRear + s.wheelFront) / 2 - 14},${bottom - 6}" stroke="${shade(hex, -0.22)}" stroke-width="2"/>
    <rect x="${frontTop[0] - 22}" y="${frontTop[1] + 4}" width="26" height="10" rx="5" fill="#f4f6ff"/>
    <rect x="${rearTop[0] - 2}" y="${rearTop[1] + 2}" width="12" height="16" rx="4" fill="#e0243a"/>
    ${wheel(s.wheelRear, s.r, id)}${wheel(s.wheelFront, s.r, id)}`;
  const label = opts.label === false ? "" : `<text x="784" y="588" text-anchor="end" font-family="system-ui,sans-serif" font-size="14" fill="#fff" opacity=".45">DEMO PHOTO</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600" role="img" aria-label="Illustration of a ${body.replace(/_/g, " ")}">
  <defs>
    <linearGradient id="paint${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(hex, 0.18)}"/><stop offset=".45" stop-color="#${hex}"/><stop offset="1" stop-color="${shade(hex, -0.2)}"/></linearGradient>
    <linearGradient id="glass${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c2740"/><stop offset=".5" stop-color="#0c1224"/><stop offset=".55" stop-color="#3a4a6e"/><stop offset="1" stop-color="#0c1224"/></linearGradient>
    <radialGradient id="rim${id}"><stop offset="0" stop-color="#e3e8f2"/><stop offset="1" stop-color="#6e7788"/></radialGradient>
  </defs>
  ${scene}
  <g transform="${mirror ? "translate(800 0) scale(-1 1)" : ""}">${car}</g>
  ${label}
</svg>`;
}
