import "server-only";

import { NextResponse } from "next/server";
import { createClient, type ServerSupabase } from "../supabase/server";
import type { Profile } from "./session";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** Resolve the signed-in user's profile for an API route, or throw 401. */
export async function apiProfile(): Promise<{ supabase: ServerSupabase; profile: Profile }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new ApiError(401, "Sign in first.");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
  if (!profile) throw new ApiError(401, "Profile not found.");
  return { supabase, profile };
}

/** Wrap a route handler so thrown ApiErrors become JSON responses. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return json({ error: err.message }, { status: err.status });
      const message = (err as { message?: string })?.message ?? "Something went wrong.";
      console.error("[api]", err);
      return json({ error: message }, { status: 500 });
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Invalid JSON body.");
  }
}
