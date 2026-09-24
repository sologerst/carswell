import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <WifiOff className="size-10 text-muted" />
      <h1 className="text-2xl font-bold">You&apos;re offline</h1>
      <p className="max-w-sm text-muted">
        Cars you&apos;ve already loaded are still swipeable, and your swipes save as soon as you&apos;re back online.
      </p>
      <a href="/deck" className="tap mt-2 inline-flex items-center rounded-full bg-accent px-6 font-bold text-white">Back to the deck</a>
    </main>
  );
}
