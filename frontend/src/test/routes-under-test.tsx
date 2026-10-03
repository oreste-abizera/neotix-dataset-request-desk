import { Suspense } from "react";
import { AppRoutes } from "@/app/routes";

/** The real route table, with a Suspense boundary for the lazy pages. */
export default function RoutesUnderTest() {
  return (
    <Suspense fallback={null}>
      <AppRoutes />
    </Suspense>
  );
}
