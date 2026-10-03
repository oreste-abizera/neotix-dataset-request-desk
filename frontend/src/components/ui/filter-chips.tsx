import { cn } from "@/lib/cn";

export interface Chip<T extends string> {
  value: T;
  label: string;
}

/** A group of toggle buttons for choosing one filter value. */
export function FilterChips<T extends string>({
  label,
  chips,
  value,
  onChange,
}: {
  label: string;
  chips: Chip<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {chips.map((c, i) => {
        const active = c.value === value;
        return (
          <button
            key={c.value}
            type="button"
            aria-pressed={active}
            data-shortcut-focus={i === 0 ? "" : undefined}
            onClick={() => onChange(c.value)}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-3.5 text-base font-medium transition-colors",
              active
                ? "border-primary bg-primary-soft text-primary"
                : "border-line bg-surface text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
