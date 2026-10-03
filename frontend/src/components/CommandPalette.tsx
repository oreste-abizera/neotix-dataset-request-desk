import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { LogOut, Monitor, Moon, Plus, Search, Sun, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { useRequests } from "@/api/queries/requests";
import type { User } from "@/api/types";
import { useThemeContext } from "@/app/theme";
import { navFor } from "@/app/nav";

const group =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";
const item =
  "flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-base outline-none data-[selected=true]:bg-muted";

function Entry({
  icon: Icon,
  children,
  onSelect,
  value,
}: {
  icon: LucideIcon;
  children: string;
  onSelect: () => void;
  value?: string;
}) {
  return (
    <Command.Item className={item} onSelect={onSelect} value={value ?? children}>
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      {children}
    </Command.Item>
  );
}

/** Lazy-loaded (cmdk is only fetched the first time the palette opens). */
export default function CommandPalette({
  open,
  onOpenChange,
  user,
  onSignOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  onSignOut: () => void;
}) {
  const navigate = useNavigate();
  const { setPreference } = useThemeContext();
  const recent = useRequests("", 1, open); // reuses the cached first page of the queue

  const run = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] animate-fade-in" />
        <D.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-lg animate-pop-in"
        >
          <D.Title className="sr-only">Command menu</D.Title>
          <Command label="Command menu" loop>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-4 text-muted-foreground" aria-hidden />
              <Command.Input
                placeholder="Type a command or search requests…"
                className="h-12 w-full bg-transparent text-md outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-muted-foreground">
                Nothing matches that.
              </Command.Empty>
              <Command.Group heading="Go to" className={group}>
                {navFor(user.role).map((n) => (
                  <Entry key={n.to} icon={n.icon} onSelect={run(() => navigate(n.to))}>
                    {n.label}
                  </Entry>
                ))}
                {user.role === "client" && (
                  <Entry icon={Plus} onSelect={run(() => navigate("/requests/new"))}>
                    New request
                  </Entry>
                )}
              </Command.Group>
              {recent.data && recent.data.rows.length > 0 && (
                <Command.Group heading="Requests" className={group}>
                  {recent.data.rows.slice(0, 8).map((r) => (
                    <Command.Item
                      key={r.id}
                      className={item}
                      value={`request ${r.id} ${r.task_name} ${r.client_name}`}
                      onSelect={run(() => navigate(`/requests/${r.id}`))}
                    >
                      <span className="font-mono text-muted-foreground">#{r.id}</span>
                      {r.task_name}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Appearance" className={group}>
                <Entry icon={Sun} onSelect={run(() => setPreference("light"))} value="theme light">
                  Light theme
                </Entry>
                <Entry icon={Moon} onSelect={run(() => setPreference("dark"))} value="theme dark">
                  Dark theme
                </Entry>
                <Entry
                  icon={Monitor}
                  onSelect={run(() => setPreference("system"))}
                  value="theme system"
                >
                  Match system theme
                </Entry>
              </Command.Group>
              <Command.Group heading="Account" className={group}>
                <Entry icon={LogOut} onSelect={run(onSignOut)}>
                  Sign out
                </Entry>
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
