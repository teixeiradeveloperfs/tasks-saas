import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const nextThemeLabel = theme === "dark" ? "claro" : "escuro";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("shrink-0", className)}
      onClick={toggleTheme}
      aria-label={`Ativar modo ${nextThemeLabel}`}
      title={`Ativar modo ${nextThemeLabel}`}
    >
      {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
