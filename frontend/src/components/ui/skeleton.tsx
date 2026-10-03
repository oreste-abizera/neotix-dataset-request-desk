import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Placeholder block. Decorative: the surrounding region announces loading via aria-busy. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("skeleton h-4", className)} {...props} />;
}
