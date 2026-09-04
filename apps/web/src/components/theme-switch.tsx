import { ThemeToggle } from "#/components/motion/theme-toggle.tsx";
import { cn } from "#/lib/utils.ts";

interface ThemeSwitchProps {
  className?: string;
}

export function ThemeSwitch({ className }: ThemeSwitchProps) {
  return (
    <ThemeToggle
      className={cn(
        "border-border bg-background text-foreground size-10 rounded-full border",
        className
      )}
      iconClassName="size-4"
      start="bottom-left"
      variant="circle-blur"
    />
  );
}
