"use client";

import * as React from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/lib/store";
import { apiFetch, EmptyState } from "./lib";
import { timeAgo } from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  data?: string | null;
  readAt?: string | null;
  createdAt: string;
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  INFO: Info,
  SUCCESS: CheckCircle2,
  WARNING: AlertTriangle,
  ERROR: AlertTriangle,
  ALERT: AlertTriangle,
};

function iconForType(type: string) {
  return TYPE_ICON[type?.toUpperCase()] || Bell;
}

function colorForType(type: string, read: boolean) {
  if (read) return "text-muted-foreground";
  switch (type?.toUpperCase()) {
    case "SUCCESS":
      return "text-emerald-400";
    case "WARNING":
    case "ALERT":
      return "text-amber-400";
    case "ERROR":
      return "text-rose-400";
    default:
      return "text-cyan-400";
  }
}

export function NotificationsPanel() {
  const open = useAppStore((s) => s.notifPanelOpen);
  const setOpen = useAppStore((s) => s.setNotifPanelOpen);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{
    items: NotificationItem[];
    unreadCount: number;
  }>({
    queryKey: ["notifications"],
    queryFn: () => apiFetch("/api/notifications"),
    enabled: open,
  });

  async function markAsRead(id: string) {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: "POST" });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal menandai notifikasi");
    }
  }

  return (
    <>
      {/* Backdrop */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      {/* Slide-in panel */}
      <aside
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full max-w-md border-l border-border bg-card shadow-2xl transition-transform duration-300 ease-out flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
        aria-hidden={!open}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-emerald-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Notifikasi
            </h2>
            {data?.unreadCount ? (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
                {data.unreadCount} baru
              </span>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setOpen(false)}
            aria-label="Tutup panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <ScrollArea className="flex-1">
          <div className="flex flex-col">
            {isLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : !data?.items?.length ? (
              <EmptyState
                icon={Bell}
                title="Tidak ada notifikasi"
                description="Anda telah menyelesaikan semua pemberitahuan."
              />
            ) : (
              data.items.map((n) => {
                const Icon = iconForType(n.type);
                const read = !!n.readAt;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (!read) markAsRead(n.id);
                    }}
                    className={cn(
                      "flex gap-3 border-b border-border/60 px-5 py-4 text-left hover:bg-muted/40 transition-colors",
                      !read && "bg-emerald-500/[0.04]"
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 h-5 w-5 shrink-0",
                        colorForType(n.type, read)
                      )}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            "text-sm truncate",
                            read
                              ? "text-muted-foreground"
                              : "font-medium text-foreground"
                          )}
                        >
                          {n.title}
                        </p>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      {n.body ? (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {n.body}
                        </p>
                      ) : null}
                      {!read ? (
                        <span className="text-[10px] uppercase tracking-wide text-emerald-400">
                          Klik untuk menandai dibaca
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </aside>
    </>
  );
}
