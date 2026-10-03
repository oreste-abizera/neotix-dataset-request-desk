import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "@/components/ui/states";

/** Last line of defence for rendering errors: shows a recoverable message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <ErrorState
        title="This page crashed"
        message="Something unexpected happened. Reloading usually fixes it."
        onRetry={() => window.location.reload()}
      />
    );
  }
}
