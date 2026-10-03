import { lazy, Suspense } from "react";
import { Navigate, Outlet, useLocation, useOutletContext } from "react-router";
import { useMe } from "@/api/queries/auth";
import type { Role, User } from "@/api/types";
import { Logo } from "@/components/Logo";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";

// The signed-in shell (menus, dialogs, icons, shortcuts) is not needed to show the login page.
const AppShell = lazy(() => import("./AppShell"));

export interface ShellContext {
  user: User;
}

/** The signed-in user, from inside any page rendered by the shell. */
export const useUser = (): User => useOutletContext<ShellContext>().user;

function Splash() {
  return (
    <div role="status" aria-label="Loading" className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-6">
        <Logo />
        <Skeleton className="h-2 w-40" />
      </div>
    </div>
  );
}

/** Everything except /login requires a session; the server enforces it too, this is only UX. */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <Splash />;
  if (me.isError) {
    return <ErrorState message="Could not reach the server." onRetry={() => void me.refetch()} />;
  }
  if (me.data === null)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return (
    <Suspense fallback={<Splash />}>
      <AppShell user={me.data} />
    </Suspense>
  );
}

/** Hides pages the role cannot use (the API returns 403 for them regardless). */
export function RequireRole({ roles }: { roles: Role[] }) {
  const user = useUser();
  return roles.includes(user.role) ? (
    <Outlet context={{ user }} />
  ) : (
    <Navigate to="/requests" replace />
  );
}
