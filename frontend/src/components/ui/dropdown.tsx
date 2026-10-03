import { Check } from "lucide-react";
import { DropdownMenu as M } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const DropdownMenu = M.Root;
export const DropdownTrigger = M.Trigger;
export const DropdownLabel = M.Label;
export const DropdownSeparator = (props: ComponentProps<typeof M.Separator>) => (
  <M.Separator className="my-1 h-px bg-line" {...props} />
);

export function DropdownContent({ className, ...props }: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align="end"
        sideOffset={8}
        className={cn(
          "z-50 min-w-56 rounded-lg border border-line bg-surface p-1.5 shadow-md animate-pop-in",
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownItem({ className, ...props }: ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn(
        "flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-base outline-none select-none",
        "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export const DropdownRadioGroup = M.RadioGroup;

export function DropdownRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem
      className={cn(
        "flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-base outline-none select-none data-[highlighted]:bg-muted",
        className,
      )}
      {...props}
    >
      <span className="grid size-4 place-items-center">
        <M.ItemIndicator>
          <Check className="size-4 text-primary" aria-hidden />
        </M.ItemIndicator>
      </span>
      {children}
    </M.RadioItem>
  );
}
