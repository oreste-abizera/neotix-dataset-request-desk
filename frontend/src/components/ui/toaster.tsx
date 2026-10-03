import { Toaster as Sonner } from "sonner";

/** Toasts are announced through a live region by sonner; colors come from the design tokens. */
export default function Toaster({ theme }: { theme: "light" | "dark" }) {
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "!bg-surface !text-foreground !border !border-line !shadow-md !rounded-lg !font-sans",
          description: "!text-muted-foreground",
        },
      }}
    />
  );
}
