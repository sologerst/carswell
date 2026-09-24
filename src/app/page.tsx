import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/server/session";

export default async function Welcome() {
  const profile = await getProfile();
  if (profile) redirect(profile.onboarding_completed_at ? "/deck" : "/onboarding");
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "CarSwipe";

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden lg:flex-row">
      {/* Full-bleed car photo */}
      <div className="relative h-[58dvh] w-full lg:h-auto lg:w-[58%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fx/car/midsize_suv/2b4a7e/1?label=0" alt="" className="absolute inset-0 size-full object-cover" fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-b from-navy-950/30 via-transparent to-navy-950 lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-navy-950" />
        <div className="pt-safe absolute left-5 top-5 flex items-center gap-2 lg:left-10 lg:top-8">
          <span className="brand-gradient grid size-9 place-items-center rounded-xl text-lg font-bold">C</span>
          <span className="text-lg font-bold tracking-tight">{appName}</span>
        </div>
      </div>

      <div className="relative -mt-16 flex flex-1 flex-col justify-end px-6 pb-safe lg:mt-0 lg:justify-center lg:px-16">
        <p className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-accent-soft">
          <Sparkles className="size-4" /> Now in Nashville
        </p>
        <h1 className="text-balance text-[2.6rem] font-bold leading-[1.05] tracking-tight lg:text-6xl">
          Swipe. Match.
          <br />
          Let dealers compete.
        </h1>
        <p className="mt-4 max-w-md text-lg text-muted">
          Your AI car buyer: tell it about your life, swipe nearby cars, and get real out-the-door offers.
        </p>
        <div className="mt-8 mb-6 flex flex-col gap-3 sm:flex-row lg:mb-0">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/login">
              Start <ArrowRight />
            </Link>
          </Button>
        </div>
        <p className="mb-6 text-xs text-subtle lg:mt-10">
          By continuing you agree to the <Link className="underline" href="/legal/terms">Terms</Link> and{" "}
          <Link className="underline" href="/legal/privacy">Privacy Policy</Link>. <Link className="underline" href="/data-sources">Data sources</Link>.
        </p>
      </div>
    </main>
  );
}
