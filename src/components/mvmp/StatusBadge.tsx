"use client";

import { Badge } from "@/components/ui/badge";
import { statusColor } from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";
import { statusBadgeClass } from "./lib";

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
  dot?: boolean;
}

/**
 * StatusBadge — renders a shadcn Badge styled by statusColor().
 */
export function StatusBadge({
  status,
  label,
  className,
  dot = true,
}: StatusBadgeProps) {
  const color = statusColor(status);
  const text = label ?? prettify(status);
  return (
    <Badge
      variant="outline"
      className={cn(statusBadgeClass(color), "border", className)}
    >
      {dot ? (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            color === "emerald" && "bg-emerald-400",
            color === "rose" && "bg-rose-400",
            color === "amber" && "bg-amber-400",
            color === "zinc" && "bg-zinc-400",
            color === "blue" && "bg-blue-400",
            color === "orange" && "bg-orange-400",
            color === "cyan" && "bg-cyan-400"
          )}
        />
      ) : null}
      {text}
    </Badge>
  );
}

function prettify(status: string): string {
  if (!status) return "-";
  return status
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
