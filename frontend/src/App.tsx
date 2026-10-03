import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import AnalyticsPage from "./AnalyticsPage";
import ImportPage from "./ImportPage";
import Login from "./Login";
import NewRequest from "./NewRequest";
import RequestDetail from "./RequestDetail";
import RequestList from "./RequestList";
import UsersPage from "./UsersPage";
import type { User } from "./types";
import { useLiveEvents } from "./useLiveEvents";

function useHash(): string {
  const [hash, setHash] = useState(window.location.hash || "#/requests");
  useEffect(() => {
    const on = () => setHash(window.location.hash || "#/requests");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = still checking
  const hash = useHash();
  const [refreshKey, setRefreshKey] = useState(0);
  const live = useLiveEvents(!!user && user.role !== "client", () => setRefreshKey((k) => k + 1));

  useEffect(() => {
    api
      .get<User>("/auth/me")
      .then(setUser)
      .catch((e) => {
        if (!(e instanceof ApiError) || e.status === 401) setUser(null);
      });
  }, []);

  if (user === undefined) return <p className="narrow">Loading…</p>;
  if (user === null) return <Login onLogin={(u) => { window.location.hash = "#/requests"; setUser(u); }} />;

  const staff = user.role !== "client";
  const route = hash.replace(/^#/, "");
  const detail = route.match(/^\/requests\/(\d+)$/);

  async function logout() {
    await api.post("/auth/logout").catch(() => undefined);
    setUser(null);
  }

  let page;
  if (detail) page = <RequestDetail key={detail[1]} id={Number(detail[1])} user={user} refreshKey={refreshKey} />;
  else if (route === "/new" && !staff) page = <NewRequest />;
  else if (route === "/import" && staff) page = <ImportPage />;
  else if (route === "/analytics" && staff) page = <AnalyticsPage />;
  else if (route === "/users" && user.role === "admin") page = <UsersPage me={user} />;
  else page = <RequestList user={user} refreshKey={refreshKey} />;

  return (
    <>
      <header>
        <strong>Dataset Request Desk</strong>
        <nav>
          <a href="#/requests">Requests</a>
          {staff && <a href="#/import">Import</a>}
          {staff && <a href="#/analytics">Analytics</a>}
          {user.role === "admin" && <a href="#/users">Users</a>}
        </nav>
        <span className="spacer" />
        {staff && (
          <span className={`live ${live ? "on" : "off"}`} title="Live updates from the server">
            {live ? "● Live" : "○ Offline"}
          </span>
        )}
        <span className="muted">
          {user.name} · {user.role}
        </span>
        <button className="secondary" onClick={logout}>
          Sign out
        </button>
      </header>
      <main>{page}</main>
    </>
  );
}
