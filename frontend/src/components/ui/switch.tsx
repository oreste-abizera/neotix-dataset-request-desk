import { Switch as S } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Track is 44x24 so it meets the target-size minimum. */
export function Switch({ className, ...props }: ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border border-input-line bg-muted transition-colors",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-[18px] translate-x-[2px] rounded-full bg-foreground shadow-xs transition-transform data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-primary-foreground" />
    </S.Root>
  );
}
