// Progressive profiling: ask the rest later, one question at a time, only when
// it helps. At most one question per N swipes (app_config.limits).

import { featureLabel } from "../criteria/features";
import { BODY_LABEL, type Affinity, type BodyStyle, type Prefs, type Tier } from "../types";

export interface QuestionOption {
  label: string;
  /** Preference to upsert; arrays are merged by the server. null = just dismiss. */
  set: { key: string; value: unknown; tier: Tier; merge?: boolean } | null;
}

export interface ProfilingQuestion {
  id: string;
  text: string;
  options: QuestionOption[];
}

export interface QuestionContext {
  swipes: number;
  lastQuestionSwipe: number;
  every: number;
  affinities: Affinity[];
  prefs: Prefs;
  dismissed: string[];
}

const plural = (s: string) => (s.endsWith("s") ? s : `${s}s`);

export function nextQuestion(ctx: QuestionContext): ProfilingQuestion | null {
  if (ctx.swipes < 5 || ctx.swipes - ctx.lastQuestionSwipe < ctx.every) return null;
  const skip = new Set(ctx.dismissed);
  const byStrength = [...ctx.affinities].sort((a, b) => b.likes + b.passes - (a.likes + a.passes));

  // After 5 passes on a body style with no likes: "Should I stop showing sedans?"
  for (const a of byStrength) {
    if (!a.attribute.startsWith("body:") || a.likes > 0 || a.passes < 2.5) continue;
    const body = a.attribute.slice(5) as BodyStyle;
    const id = `stop_body:${body}`;
    const wanted = (ctx.prefs.body_styles?.value as string[] | undefined) ?? [];
    const excluded = (ctx.prefs.body_styles_exclude?.value as string[] | undefined) ?? [];
    if (skip.has(id) || excluded.includes(body) || wanted.includes(body)) continue;
    const label = plural(BODY_LABEL[body]?.toLowerCase() ?? body);
    return {
      id,
      text: `Should I stop showing ${label}?`,
      options: [
        { label: `Yes, hide ${label}`, set: { key: "body_styles_exclude", value: [body], tier: "must", merge: true } },
        { label: "No, keep them", set: null },
      ],
    };
  }

  // After 3 likes with a feature: "Is a sunroof a must-have?"
  for (const a of byStrength) {
    if (!a.attribute.startsWith("feature:") || a.likes < 3 || a.likes < a.passes * 2) continue;
    const key = a.attribute;
    const id = `feature_tier:${key}`;
    if (skip.has(id) || ctx.prefs[key]) continue;
    const label = featureLabel(key.slice(8));
    return {
      id,
      text: `You keep liking cars with ${label.toLowerCase()}. Is it a must-have?`,
      options: [
        { label: "Must-have", set: { key, value: true, tier: "must" } },
        { label: "Nice-to-have", set: { key, value: true, tier: "nice" } },
        { label: "Don't care", set: { key, value: true, tier: "dont_care" } },
      ],
    };
  }

  // Repeated passes on a color: "Avoid red cars?"
  for (const a of byStrength) {
    if (!a.attribute.startsWith("color:") || a.likes > 0 || a.passes < 2) continue;
    const color = a.attribute.slice(6);
    const id = `avoid_color:${color}`;
    const avoided = (ctx.prefs.colors_avoid?.value as string[] | undefined) ?? [];
    if (skip.has(id) || avoided.includes(color)) continue;
    return {
      id,
      text: `Skip ${color} cars from now on?`,
      options: [
        { label: `Yes, no ${color}`, set: { key: "colors_avoid", value: [color], tier: "dealbreaker", merge: true } },
        { label: "Keep showing them", set: null },
      ],
    };
  }

  // Strong make affinity: "Want to see more Toyotas?"
  for (const a of byStrength) {
    if (!a.attribute.startsWith("make:") || a.likes < 4 || a.likes < a.passes * 2) continue;
    const make = a.attribute.slice(5);
    const id = `more_make:${make}`;
    const makes = (ctx.prefs.makes?.value as string[] | undefined) ?? [];
    if (skip.has(id) || makes.includes(make)) continue;
    return {
      id,
      text: `You like ${plural(make)}. Show more of them?`,
      options: [
        { label: "Yes, more", set: { key: "makes", value: [make], tier: "nice", merge: true } },
        { label: "No thanks", set: null },
      ],
    };
  }
  return null;
}
