import Link from "next/link";

export default function JoinLayout({ children }: LayoutProps<"/join">) {
  return (
    <div className="min-h-dvh">
      <header className="pt-safe border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4">
          <Link href="/" className="flex items-center gap-2 font-bold"><span className="brand-gradient grid size-8 place-items-center rounded-lg">C</span> CarSwipe for dealers</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
