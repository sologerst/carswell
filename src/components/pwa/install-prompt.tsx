"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const KEY = "carswipe:install-dismissed";

/** Android/desktop: native install prompt. iOS: "Share > Add to Home Screen" hint. */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === "1";
    } catch {}
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    if (dismissed || standalone) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    if (isIos) {
      const t = setTimeout(() => {
        setIos(true);
        setHidden(false);
      }, 20_000);
      return () => clearTimeout(t);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  };

  if (hidden) return null;
  return (
    <div className="fixed inset-x-3 bottom-[calc(76px+var(--safe-bottom))] z-30 flex items-center gap-3 rounded-3xl border border-line bg-navy-800/95 p-3 pl-4 shadow-2xl backdrop-blur lg:bottom-6 lg:left-auto lg:right-6 lg:w-96">
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold">Install CarSwipe</p>
        {ios ? (
          <p className="text-muted">Tap <Share className="inline size-4 align-text-bottom" /> then &quot;Add to Home Screen&quot; for offers and alerts.</p>
        ) : (
          <p className="text-muted">Swipe offline and get offer alerts.</p>
        )}
      </div>
      {!ios && deferred && (
        <Button size="sm" onClick={async () => { await deferred.prompt(); await deferred.userChoice; dismiss(); }}>
          <Download /> Install
        </Button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" className="tap grid place-items-center rounded-full text-muted hover:text-ink cursor-pointer">
        <X className="size-5" />
      </button>
    </div>
  );
}
