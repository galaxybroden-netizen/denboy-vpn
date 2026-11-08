"use client";

/**
 * Shared MVMP UI helpers:
 *  - QueryProvider (TanStack Query context)
 *  - apiFetch wrapper that unwraps { success, data, error }
 *  - EmptyState component
 *  - LoadingSkeleton component
 */

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Query client
// ---------------------------------------------------------------------------

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// ---------------------------------------------------------------------------
// API fetch helper
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function apiFetch<T = any>(
  input: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    credentials: "include",
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    throw new ApiError("PARSE_ERROR", "Respons server tidak valid", res.status);
  }
  if (!json?.success) {
    const err = json?.error || {};
    throw new ApiError(
      err.code || "UNKNOWN",
      err.message || "Terjadi kesalahan",
      res.status
    );
  }
  return json.data as T;
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function EmptyState({
  title = "Belum ada data",
  description,
  icon: Icon = Inbox,
  className,
}: {
  title?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-4 py-12 text-center",
        className
      )}
    >
      <div className="rounded-full bg-muted/50 p-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

export function LoadingSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 p-4", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers for status color → tailwind classes
// ---------------------------------------------------------------------------

export const STATUS_BADGE_CLASS: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rose: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  zinc: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  orange: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  cyan: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};

export function statusBadgeClass(color: string): string {
  return STATUS_BADGE_CLASS[color] || STATUS_BADGE_CLASS.zinc;
}

// ---------------------------------------------------------------------------
// Engine → color mapping (for protocol engine)
// ---------------------------------------------------------------------------

export const ENGINE_COLORS: Record<string, string> = {
  xray: "cyan",
  "sing-box": "emerald",
  wireguard: "amber",
  openvpn: "blue",
  openssh: "orange",
};

export function engineColor(engine: string | undefined | null): string {
  if (!engine) return "zinc";
  return ENGINE_COLORS[engine.toLowerCase()] || "zinc";
}

// ---------------------------------------------------------------------------
// Mutation hook helper for TanStack (using apiFetch)
// ---------------------------------------------------------------------------

export function useToastHelper() {
  // Lazy re-export so views don't need extra import lines
  return React.useCallback((promise: Promise<any>, msgs: { success: string; error?: string }) => {
    promise
      .then(() => {
        import("sonner").then(({ toast }) => toast.success(msgs.success));
      })
      .catch((e: any) => {
        import("sonner").then(({ toast }) =>
          toast.error(msgs.error || e?.message || "Terjadi kesalahan")
        );
      });
  }, []);
}
