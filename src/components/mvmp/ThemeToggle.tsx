"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * ThemeToggle — single-click dark/light toggle.
 * - Uses next-themes useTheme() hook.
 * - Avoids hydration mismatch by only rendering after mount.
 * - Sun icon when light, Moon icon when dark.
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Avoid hydration mismatch — render a stable placeholder on the server.
  if (!mounted) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label="Ganti tema"
            disabled
          >
            <Sun className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ganti tema</TooltipContent>
      </Tooltip>
    );
  }

  // resolvedTheme is more reliable than `theme` when system is allowed; here we
  // toggle strictly between dark and light since enableSystem={false}.
  const current = (resolvedTheme || theme) === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  const isDark = current === "dark";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label={isDark ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
          onClick={() => setTheme(next)}
        >
          {isDark ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isDark ? "Mode terang" : "Mode gelap"}
      </TooltipContent>
    </Tooltip>
  );
}
