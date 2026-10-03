import { Suspense } from "react";
import { AppRoutes } from "./routes";
import { ErrorBoundary } from "./ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <AppRoutes />
      </Suspense>
    </ErrorBoundary>
  );
}
