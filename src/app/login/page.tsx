import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : null;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <LoginForm
        next={safeNext}
        demo={process.env.NEXT_PUBLIC_DEMO_LOGIN === "true"}
        oauth={{ google: process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true", apple: process.env.NEXT_PUBLIC_AUTH_APPLE === "true" }}
      />
    </main>
  );
}
