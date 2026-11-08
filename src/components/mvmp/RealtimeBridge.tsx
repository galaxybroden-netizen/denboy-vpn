"use client";

// MVMP — Realtime bridge (Batch 3)
// Connects the browser to the socket.io mini-service and maps incoming
// events to TanStack Query invalidations + toasts. Renders nothing.

import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { create } from "zustand";

interface RealtimeState {
  connected: boolean;
  setConnected: (b: boolean) => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  connected: false,
  setConnected: (b) => set({ connected: b }),
}));

interface RealtimeNotification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  createdAt: string;
}

export function RealtimeBridge() {
  const queryClient = useQueryClient();
  const setConnected = useRealtimeStore((s) => s.setConnected);

  React.useEffect(() => {
    const socket: Socket = io("/?XTransformPort=3003", {
      path: "/",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 8000,
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    // New in-app notification -> toast + refresh counters/list
    socket.on("notification:new", (n: RealtimeNotification) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-count"] });
      if (n?.title) {
        if (n.type === "WARNING") {
          toast.warning(n.title, { description: n.body || undefined });
        } else {
          toast.info(n.title, { description: n.body || undefined });
        }
      }
    });

    // Fresh agent metrics -> refresh dashboards/monitoring/map
    socket.on("metrics:update", () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["monitoring"] });
      queryClient.invalidateQueries({ queryKey: ["server-map"] });
    });

    socket.on("job:update", () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    });

    // Payment lifecycle -> refresh payments, transactions, revenue
    socket.on("payment:update", (p: { action?: string; invoiceNumber?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["customer-dashboard"] });
      if (p?.action === "NEW_PENDING" && p.invoiceNumber) {
        toast.info("Pembelian baru", {
          description: `${p.invoiceNumber} menunggu verifikasi pembayaran.`,
        });
      }
    });

    // VPN account created -> refresh account lists
    socket.on("account:update", () => {
      queryClient.invalidateQueries({ queryKey: ["vpn-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["customer-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["reseller-dashboard"] });
    });

    // Mock email sent -> refresh email log view if open
    socket.on("email:new", () => {
      queryClient.invalidateQueries({ queryKey: ["email-logs"] });
    });

    return () => {
      socket.disconnect();
      setConnected(false);
    };
  }, [queryClient, setConnected]);

  return null;
}
