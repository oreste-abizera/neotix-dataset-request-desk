import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

const ROWS: { keys: string[]; label: string; staffOnly?: boolean; clientOnly?: boolean }[] = [
  { keys: [MOD, "K"], label: "Open the command menu" },
  { keys: ["?"], label: "Show this help" },
  { keys: ["g", "r"], label: "Go to requests" },
  { keys: ["n"], label: "New request", clientOnly: true },
  { keys: ["g", "i"], label: "Go to import", staffOnly: true },
  { keys: ["g", "a"], label: "Go to analytics", staffOnly: true },
  { keys: ["/"], label: "Focus the first filter on the page" },
  { keys: ["Esc"], label: "Close a dialog or menu" },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
  staff,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: boolean;
}) {
  const rows = ROWS.filter((r) => (r.staffOnly ? staff : r.clientOnly ? !staff : true));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Keyboard shortcuts"
        description="Shortcuts are off while you are typing in a field."
      >
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-4 py-2.5">
              <span>{r.label}</span>
              <span className="flex items-center gap-1" aria-label={r.keys.join(" then ")}>
                {r.keys.map((k, i) => (
                  <span key={k} className="flex items-center gap-1">
                    {i > 0 && <span className="text-xs text-muted-foreground">then</span>}
                    <Kbd>{k}</Kbd>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
