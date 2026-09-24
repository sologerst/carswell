import "server-only";

import { aiExtractOnboarding } from "../ai/onboarding";
import { aiProfileSummary, templateProfileSummary } from "../ai/summaries";
import { CRITERION_BY_KEY, LIFE_STORY_KEY } from "../criteria/catalog";
import { extractFromChip, extractFromText, type Extraction } from "../onboarding/extract";
import { nextSlot, progress, SLOT_BY_ID, OPENING_QUESTION, type OnboardingState, type Slot, type SlotId } from "../onboarding/slots";
import { profileHash } from "../profile-hash";
import type { ServerSupabase } from "../supabase/server";
import type { Pref, Prefs } from "../types";
import { loadConfig, loadPrefs, upsertPrefs, zipLocation } from "./data";
import type { Profile } from "./session";

export const STATE_KEY = "_onboarding";

interface StoredState {
  answered: SlotId[];
  taste_done: boolean;
  facts: string[];
}

export interface ChatTurn {
  reply: string;
  /** Known ZIP, so the location step only asks for a radius. */
  zip?: string | null;
  slot: Slot | null;
  progress: number;
  done: boolean;
  aiUsed: boolean;
  summary?: string;
}

function readState(prefs: Prefs): StoredState {
  const v = prefs[STATE_KEY]?.value as Partial<StoredState> | undefined;
  return { answered: v?.answered ?? [], taste_done: v?.taste_done ?? false, facts: v?.facts ?? [] };
}

function knownSummary(prefs: Prefs, profile: Profile): string {
  const lines = Object.entries(prefs)
    .filter(([k]) => !k.startsWith("_") && k !== LIFE_STORY_KEY)
    .map(([k, p]) => `- ${CRITERION_BY_KEY[k]?.label ?? k}: ${JSON.stringify(p.value)}`);
  if (profile.zip) lines.push(`- ZIP: ${profile.zip}`);
  if (profile.first_name) lines.push(`- Name: ${profile.first_name}`);
  return lines.join("\n");
}

function templateAck(x: Extraction, name: string | null): string {
  const bits = x.facts.slice(0, 3).map((f) => f.toLowerCase());
  const n = Object.keys(x.prefs).length;
  if (bits.length) return `Got it${name ? `, ${name}` : ""}: ${bits.join(", ")}. I'll factor that in.`;
  if (n > 0) return `Got it${name ? `, ${name}` : ""}.`;
  return "Thanks! Let me ask a couple of quick questions.";
}

/** Apply an extraction: prefs, profile fields, answered slots. Returns the new state. */
async function applyExtraction(
  supabase: ServerSupabase, profile: Profile, prefs: Prefs, state: StoredState, x: Extraction, answered?: SlotId,
): Promise<{ prefs: Prefs; profile: Profile; state: StoredState }> {
  const changes: Record<string, Pref> = {};
  for (const [k, p] of Object.entries(x.prefs)) {
    const prev = prefs[k];
    // Don't let an inference overwrite something the buyer explicitly said.
    if (prev && prev.source === "said" && p.source !== "said") continue;
    changes[k] = p as Pref;
  }
  const nextState: StoredState = {
    answered: answered && !state.answered.includes(answered) ? [...state.answered, answered] : state.answered,
    taste_done: state.taste_done,
    facts: [...new Set([...state.facts, ...x.facts])].slice(0, 20),
  };
  changes[STATE_KEY] = { value: nextState, tier: "dont_care", source: "default" };
  await upsertPrefs(supabase, profile.id, changes);

  const profilePatch: Partial<Profile> = {};
  if (x.profile.first_name && !profile.first_name) profilePatch.first_name = x.profile.first_name;
  if (x.profile.zip && (await zipLocation(supabase, x.profile.zip))) profilePatch.zip = x.profile.zip;
  if (x.profile.radius_mi) profilePatch.radius_mi = Math.min(500, Math.max(5, x.profile.radius_mi));
  let nextProfile = profile;
  if (Object.keys(profilePatch).length) {
    const { data } = await supabase.from("profiles").update(profilePatch).eq("id", profile.id).select("*").single();
    if (data) nextProfile = data;
  }
  if (x.profile.radius_mi && !nextState.answered.includes("location") && nextProfile.zip) {
    nextState.answered.push("location");
    await upsertPrefs(supabase, profile.id, { [STATE_KEY]: { value: nextState, tier: "dont_care", source: "default" } });
  }
  return { prefs: { ...prefs, ...changes }, profile: nextProfile, state: nextState };
}

function toOnboardingState(prefs: Prefs, profile: Profile, state: StoredState): OnboardingState {
  return {
    prefs,
    zip: profile.zip,
    radiusSet: state.answered.includes("location"),
    tasteDone: state.taste_done,
    answered: state.answered,
  };
}

export async function onboardingTurn(
  supabase: ServerSupabase,
  profile: Profile,
  input: { message?: string; chip?: { slot: SlotId; value: string } },
): Promise<ChatTurn> {
  const config = await loadConfig(supabase);
  let prefs = await loadPrefs(supabase, profile.id);
  let state = readState(prefs);
  let reply = "";
  let aiUsed = false;

  if (input.chip) {
    const x = extractFromChip(input.chip.slot, input.chip.value);
    if (input.chip.slot === "location" && x.profile.zip && !(await zipLocation(supabase, x.profile.zip))) {
      const ob = toOnboardingState(prefs, profile, state);
      return { reply: `I don't have ${x.profile.zip} on the map yet. CarSwipe is live around Nashville; try a Middle Tennessee ZIP like 37203.`, slot: SLOT_BY_ID.location, progress: progress(ob), done: false, aiUsed };
    }
    // A ZIP alone doesn't finish the location step; the radius does.
    const answers = input.chip.slot === "location" && !x.profile.radius_mi ? undefined : input.chip.slot;
    ({ prefs, profile, state } = await applyExtraction(supabase, profile, prefs, state, x, answers));
    if (input.chip.slot === "location" && x.profile.zip) reply = "Got it.";
  } else if (input.message?.trim()) {
    const text = input.message.trim().slice(0, 4000);
    const isOpening = !prefs[LIFE_STORY_KEY];
    const source = isOpening ? "life" : "said";
    const ai = await aiExtractOnboarding(text, { alreadyKnown: knownSummary(prefs, profile), source }, {
      store: supabase, userId: profile.id, dailyBudgetUsd: config.ai.daily_budget_usd_per_user,
    });
    const x = ai?.extraction ?? extractFromText(text, source);
    aiUsed = Boolean(ai);
    if (isOpening) x.prefs[LIFE_STORY_KEY] = { value: text, tier: "nice", source: "life" };
    ({ prefs, profile, state } = await applyExtraction(supabase, profile, prefs, state, x));
    reply = ai?.acknowledgement ?? templateAck(x, profile.first_name);
  }

  const ob = toOnboardingState(prefs, profile, state);
  const slot = nextSlot(ob);
  if (!slot) {
    const summary = await finishOnboarding(supabase, profile, prefs, "chat");
    return { reply: "You're all set. Here's your first deck.", slot: null, progress: 1, done: true, aiUsed, summary };
  }
  const opening = !prefs[LIFE_STORY_KEY] && !input.chip && !input.message;
  const question = opening ? OPENING_QUESTION
    : slot.id === "location" && profile.zip ? `How far from ${profile.zip} will you drive to see a car?` : slot.question;
  return {
    reply: [reply, question].filter(Boolean).join(" "),
    zip: profile.zip,
    slot: opening ? null : slot,
    progress: progress(ob),
    done: false,
    aiUsed,
  };
}

export async function markTasteDone(supabase: ServerSupabase, profile: Profile): Promise<ChatTurn> {
  const prefs = await loadPrefs(supabase, profile.id);
  const state = { ...readState(prefs), taste_done: true };
  await upsertPrefs(supabase, profile.id, { [STATE_KEY]: { value: state, tier: "dont_care", source: "default" } });
  return onboardingTurn(supabase, { ...profile }, {});
}

/** Mark onboarding complete and write "What the AI thinks you want". */
export async function finishOnboarding(supabase: ServerSupabase, profile: Profile, prefs: Prefs, method: "chat" | "form"): Promise<string> {
  const config = await loadConfig(supabase);
  const visible = Object.fromEntries(Object.entries(prefs).filter(([k]) => !k.startsWith("_") && k !== LIFE_STORY_KEY));
  const facts = readState(prefs).facts;
  const summary = await aiProfileSummary(visible, facts, {
    store: supabase, userId: profile.id, dailyBudgetUsd: config.ai.daily_budget_usd_per_user,
  }).catch(() => templateProfileSummary(visible));
  await supabase.from("profiles").update({
    onboarding_completed_at: profile.onboarding_completed_at ?? new Date().toISOString(),
    onboarding_method: profile.onboarding_method ?? method,
    ai_summary: summary,
    profile_hash: profileHash(visible),
  }).eq("id", profile.id);
  return summary;
}
