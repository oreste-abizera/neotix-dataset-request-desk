import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { RequireAuth, RequireRole } from "./guards";

// Every page is its own chunk, fetched on first visit.
const LoginPage = lazy(() => import("@/features/login/LoginPage"));
const RequestsPage = lazy(() => import("@/features/requests/RequestsPage"));
const NewRequestPage = lazy(() => import("@/features/requests/NewRequestPage"));
const RequestDetailPage = lazy(() => import("@/features/requests/RequestDetailPage"));
const ImportPage = lazy(() => import("@/features/imports/ImportPage"));
const AnalyticsPage = lazy(() => import("@/features/analytics/AnalyticsPage"));
const UsersPage = lazy(() => import("@/features/users/UsersPage"));
const NotFoundPage = lazy(() => import("@/features/NotFoundPage"));

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route index element={<Navigate to="/requests" replace />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route element={<RequireRole roles={["client"]} />}>
          <Route path="requests/new" element={<NewRequestPage />} />
        </Route>
        <Route path="requests/:id" element={<RequestDetailPage />} />
        <Route element={<RequireRole roles={["operator", "admin"]} />}>
          <Route path="imports" element={<ImportPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
        </Route>
        <Route element={<RequireRole roles={["admin"]} />}>
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
