import React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

/**
 * Kaizen theme switcher — toggles light/dark via next-themes (class strategy).
 * Presentational only; does not touch any app state or workflow.
 */
export default function ThemeToggle({ className = "" }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";
  const toggle = () => setTheme(isDark ? "light" : "dark");

  // Avoid hydration/first-paint mismatch: render a stable neutral button until mounted.
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border " +
        "bg-background text-foreground/80 transition-colors hover:bg-accent-subtle hover:text-foreground " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
        "focus-visible:ring-offset-background " + className
      }
    >
      {mounted && isDark ? (
        <Sun className="h-[18px] w-[18px]" />
      ) : (
        <Moon className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}
