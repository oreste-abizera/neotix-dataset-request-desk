import { Command as CommandIcon, Keyboard, LogOut, Menu, Monitor, Moon, Sun } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useLiveEvents } from "@/api/queries/events";
import { useLogout } from "@/api/queries/auth";
import type { User } from "@/api/types";
import { Logo } from "@/components/Logo";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import {
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Tip, TooltipProvider } from "@/components/ui/tooltip";
import { useFocusReturn } from "@/hooks/useFocusReturn";
import { useHotkeys } from "@/hooks/useHotkeys";
import { cn } from "@/lib/cn";
import { ROLE_LABEL } from "@/lib/copy";
import type { ThemePreference } from "@/hooks/useTheme";
import { ErrorBoundary } from "./ErrorBoundary";
import { navFor } from "./nav";
import { useThemeContext } from "./theme";

const CommandPalette = lazy(() => import("@/components/CommandPalette"));

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex h-9 items-center gap-2 rounded-md px-3 text-base font-medium transition-colors",
    isActive
      ? "bg-primary-soft text-primary"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

function LivePill({ state }: { state: "connecting" | "live" | "offline" }) {
  const label =
    state === "live" ? "Live updates on" : state === "offline" ? "Reconnecting…" : "Connecting…";
  return (
    <Tip label={label}>
      <span
        role="status"
        className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-sm text-muted-foreground sm:inline-flex"
      >
        <span
          aria-hidden
          className={cn(
            "size-2 rounded-full",
            state === "live" ? "animate-pulse-dot bg-success" : "bg-muted-foreground/60",
          )}
        />
        <span>{state === "live" ? "Live" : state === "offline" ? "Offline" : "Connecting"}</span>
      </span>
    </Tip>
  );
}

function UserMenu({
  user,
  onSignOut,
  onShortcuts,
  onPalette,
}: {
  user: User;
  onSignOut: () => void;
  onShortcuts: () => void;
  onPalette: () => void;
}) {
  const { preference, setPreference } = useThemeContext();
  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 px-1.5"
          aria-label={`${user.name}, account menu`}
        >
          <span
            aria-hidden
            data-initials={initials}
            className="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground before:content-[attr(data-initials)]"
          />
          <span className="hidden max-w-32 truncate md:inline">{user.name}</span>
        </Button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel className="px-2.5 py-2">
          <p className="font-medium">{user.name}</p>
          <p className="text-sm text-muted-foreground">
            {ROLE_LABEL[user.role]} · {user.email}
          </p>
        </DropdownLabel>
        <DropdownSeparator />
        <DropdownItem onSelect={onPalette}>
          <CommandIcon className="size-4" aria-hidden /> Command menu
        </DropdownItem>
        <DropdownItem onSelect={onShortcuts}>
          <Keyboard className="size-4" aria-hidden /> Keyboard shortcuts
        </DropdownItem>
        <DropdownSeparator />
        <DropdownLabel className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Theme
        </DropdownLabel>
        <DropdownRadioGroup
          value={preference}
          onValueChange={(v) => setPreference(v as ThemePreference)}
        >
          <DropdownRadioItem value="light">
            <Sun className="size-4" aria-hidden /> Light
          </DropdownRadioItem>
          <DropdownRadioItem value="dark">
            <Moon className="size-4" aria-hidden /> Dark
          </DropdownRadioItem>
          <DropdownRadioItem value="system">
            <Monitor className="size-4" aria-hidden /> System
          </DropdownRadioItem>
        </DropdownRadioGroup>
        <DropdownSeparator />
        <DropdownItem onSelect={onSignOut}>
          <LogOut className="size-4" aria-hidden /> Sign out
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}

function PageFallback() {
  return (
    <div aria-busy="true" aria-label="Loading page" role="status" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** After navigating, move focus to the new page's heading so keyboard and screen-reader users start there. */
function useFocusHeadingOnNavigate() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      document.querySelector<HTMLElement>("main h1")?.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(id);
  }, [pathname]);
}

export default function AppShell({ user }: { user: User }) {
  const navigate = useNavigate();
  const logout = useLogout();
  const staff = user.role !== "client";
  const live = useLiveEvents(staff);
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteLoaded, setPaletteLoaded] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const navFocus = useFocusReturn();
  useFocusHeadingOnNavigate();

  const openPalette = () => {
    setPaletteLoaded(true);
    setPaletteOpen(true);
  };
  const signOut = () =>
    logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) });

  useHotkeys({
    "mod+k": openPalette,
    "?": () => setHelpOpen(true),
    "g r": () => navigate("/requests"),
    ...(staff
      ? { "g i": () => navigate("/imports"), "g a": () => navigate("/analytics") }
      : { n: () => navigate("/requests/new") }),
    ...(user.role === "admin" ? { "g u": () => navigate("/users") } : {}),
    "/": () => document.querySelector<HTMLElement>("[data-shortcut-focus]")?.focus(),
  });

  const items = navFor(user.role);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
          <div className="mx-auto flex h-14 max-w-[75rem] items-center gap-2 px-4 sm:px-6">
            <Dialog open={navOpen} onOpenChange={setNavOpen}>
              <Button
                variant="ghost"
                size="icon"
                className="-ml-2 md:hidden"
                aria-label="Open navigation"
                onClick={(e) => {
                  navFocus.remember(e);
                  setNavOpen(true);
                }}
              >
                <Menu className="size-5" aria-hidden />
              </Button>
              <SheetContent
                title="Navigation"
                side="left"
                onCloseAutoFocus={navFocus.onCloseAutoFocus}
              >
                <nav aria-label="Main" className="flex flex-col gap-1">
                  {items.map((n) => (
                    <NavLink
                      key={n.to}
                      to={n.to}
                      className={({ isActive }) => cn(linkClass({ isActive }), "h-11")}
                    >
                      <n.icon className="size-4" aria-hidden />
                      {n.label}
                    </NavLink>
                  ))}
                </nav>
              </SheetContent>
            </Dialog>

            <Link
              to="/requests"
              className="mr-3 rounded-md"
              aria-label={`Dataset Request Desk, home`}
            >
              <Logo className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
            </Link>

            <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
              {items.map((n) => (
                <NavLink key={n.to} to={n.to} className={linkClass}>
                  <n.icon className="size-4" aria-hidden />
                  {n.label}
                </NavLink>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              {staff && <LivePill state={live} />}
              <Tip label="Command menu (⌘K)">
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden sm:inline-flex"
                  aria-label="Open command menu"
                  onClick={openPalette}
                >
                  <CommandIcon className="size-4" aria-hidden />
                </Button>
              </Tip>
              <UserMenu
                user={user}
                onSignOut={signOut}
                onShortcuts={() => setHelpOpen(true)}
                onPalette={openPalette}
              />
            </div>
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[75rem] flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8"
        >
          <ErrorBoundary>
            <Suspense fallback={<PageFallback />}>
              <Outlet context={{ user }} />
            </Suspense>
          </ErrorBoundary>
        </main>

        <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} staff={staff} />
        {paletteLoaded && (
          <Suspense fallback={null}>
            <CommandPalette
              open={paletteOpen}
              onOpenChange={setPaletteOpen}
              user={user}
              onSignOut={signOut}
            />
          </Suspense>
        )}
      </div>
    </TooltipProvider>
  );
}
