import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

const overlay = "fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] animate-fade-in";

function Header({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <D.Title className="text-md font-semibold">{title}</D.Title>
        {description ? (
          <D.Description className="mt-1 text-sm text-muted-foreground">
            {description}
          </D.Description>
        ) : (
          <D.Description className="sr-only">{title}</D.Description>
        )}
      </div>
      <D.Close asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Close">
          <X className="size-4" aria-hidden />
        </Button>
      </D.Close>
    </div>
  );
}

/** Centered modal. Focus is trapped, Escape closes, focus returns to the trigger. */
export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col",
          "rounded-xl border border-line bg-surface shadow-lg animate-pop-in",
          className,
        )}
      >
        <Header title={title} description={description} />
        <div className="overflow-y-auto p-5">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

/**
 * Bottom sheet on phones, side panel from `md` up. Same accessibility behaviour as a dialog; used
 * where a full task (assigning episodes, navigation) should keep the page behind it in view.
 */
export function SheetContent({
  title,
  description,
  children,
  side = "right",
  flush = false,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  side?: "right" | "left";
  /** The children manage their own scrolling and padding (e.g. a list with a fixed footer). */
  flush?: boolean;
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content
        className={cn(
          "fixed z-50 flex flex-col border-line bg-surface shadow-lg",
          "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-xl border-t animate-sheet-in",
          "md:inset-y-0 md:max-h-none md:w-[min(92vw,44rem)] md:rounded-none md:border-t-0 md:animate-fade-in",
          side === "right"
            ? "md:right-0 md:left-auto md:border-l"
            : "md:right-auto md:left-0 md:w-80 md:border-r",
          className,
        )}
      >
        <Header title={title} description={description} />
        <div
          className={
            flush ? "flex min-h-0 flex-1 flex-col" : "min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"
          }
        >
          {children}
        </div>
      </D.Content>
    </D.Portal>
  );
}
