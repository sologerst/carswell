import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-bold transition-[background,transform,opacity] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 cursor-pointer [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white hover:bg-accent-strong shadow-[0_10px_30px_-10px_rgb(109_94_252/0.8)]",
        secondary: "bg-navy-700 text-ink hover:bg-navy-600",
        outline: "border border-line bg-transparent text-ink hover:bg-navy-800",
        ghost: "bg-transparent text-muted hover:bg-navy-800 hover:text-ink",
        light: "bg-white text-navy-950 hover:bg-white/90",
        danger: "bg-deal-bad/15 text-deal-bad hover:bg-deal-bad/25",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-[15px]",
        lg: "h-14 px-7 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
