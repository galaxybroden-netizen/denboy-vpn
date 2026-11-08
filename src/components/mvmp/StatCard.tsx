"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Accent = "emerald" | "cyan" | "amber" | "rose";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  accent?: Accent;
  sublabel?: string;
}

const ACCENT_CLASSES: Record<Accent, { chip: string; value: string }> = {
  emerald: {
    chip: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    value: "text-emerald-400",
  },
  cyan: {
    chip: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    value: "text-cyan-400",
  },
  amber: {
    chip: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    value: "text-amber-400",
  },
  rose: {
    chip: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    value: "text-rose-400",
  },
};

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendUp,
  accent = "emerald",
  sublabel,
}: StatCardProps) {
  const cls = ACCENT_CLASSES[accent];
  return (
    <Card className="p-6 gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p className="text-2xl font-semibold tracking-tight text-foreground truncate">
            {value}
          </p>
          {sublabel ? (
            <p className="text-xs text-muted-foreground">{sublabel}</p>
          ) : null}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
            cls.chip
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {trend ? (
        <div className="flex items-center gap-1 text-xs">
          {trendUp === true ? (
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          ) : trendUp === false ? (
            <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
          ) : null}
          <span
            className={cn(
              trendUp === true && "text-emerald-400",
              trendUp === false && "text-rose-400",
              trendUp === undefined && "text-muted-foreground"
            )}
          >
            {trend}
          </span>
        </div>
      ) : null}
    </Card>
  );
}
