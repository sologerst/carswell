import Link from "next/link";

export default function LegalLayout({ children }: LayoutProps<"/legal">) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="text-sm font-bold text-muted hover:text-ink">← CarSwipe</Link>
      <article className="mt-6 space-y-4 text-[15px] leading-relaxed text-muted [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-ink [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </article>
    </main>
  );
}
