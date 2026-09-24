"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Bottom sheet on phones, right-side panel on desktop. */
export function Sheet({
  open, onOpenChange, title, description, children, className, side = "auto",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  side?: "auto" | "bottom" | "center";
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border-line bg-navy-900 text-ink shadow-2xl focus:outline-none",
            side === "center"
              ? "left-1/2 top-1/2 w-[min(92vw,480px)] max-h-[85dvh] -translate-x-1/2 -translate-y-1/2 rounded-3xl border"
              : side === "bottom"
                ? "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[2rem] border-t pb-safe"
                : "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[2rem] border-t pb-safe lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[520px] lg:rounded-none lg:rounded-l-[2rem] lg:border-l lg:border-t-0",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-2">
            <div className="min-w-0">
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-navy-600 lg:hidden" aria-hidden />
              <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
              {description ? <Dialog.Description className="text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close className="tap -mr-2 grid place-items-center rounded-full text-muted hover:bg-navy-800 hover:text-ink" aria-label="Close">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
