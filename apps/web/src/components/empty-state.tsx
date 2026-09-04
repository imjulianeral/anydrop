import type { ReactNode } from "react";

import { cn } from "#/lib/utils.ts";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 p-6 text-center",
        className
      )}
    >
      {icon ? (
        <div className="bg-muted text-muted-foreground grid size-12 place-items-center rounded-2xl">
          {icon}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-lg tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground max-w-sm text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
