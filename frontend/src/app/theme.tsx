import { createContext, useContext, useMemo, type ReactNode } from "react";
import { resolveTheme, useTheme, type ThemePreference } from "@/hooks/useTheme";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { preference, setPreference } = useTheme();
  const value = useMemo(
    () => ({ preference, setPreference, resolved: resolveTheme(preference) }),
    [preference, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used inside <ThemeProvider>");
  return ctx;
}
